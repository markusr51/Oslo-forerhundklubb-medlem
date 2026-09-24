import { createClubClient } from "../_shared/portal-scope.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(
  Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
);
const SECRET_KEY =
  secretKeys.default;
const REPLY_TOKEN =
  Deno.env.get("SVEVE_REPLY_TOKEN") || "";
const SVEVE_USER =
  Deno.env.get("SVEVE_USER") || "";
const SVEVE_API_KEY =
  Deno.env.get("SVEVE_API_KEY") || "";
const SVEVE_SENDER_TEXT =
  Deno.env.get("SVEVE_SENDER_TEXT") || "Oslo FHK";
function normalizeNorwegianMobile(value: string) {
  let number = value.replace(/[^\d+]/g, "");
  if (number.startsWith("+47")) {
    number = number.slice(3);
  } else if (number.startsWith("0047")) {
    number = number.slice(4);
  }
  if (/^\d{8}$/.test(number)) {
    return number;
  }
  return number.replace(/\D/g, "");
}
function normalizeReplyText(value: string) {
  return value
    .trim()
    .toLocaleUpperCase("nb-NO")
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function interpretReply(value: string) {
  const normalized =
    normalizeReplyText(value);
  const yesMatch =
    normalized.match(
      /^(JA(?: TAKK)?|JEG KOMMER|PÅMELD|PAMELD)(?:\s+(\d{1,2}))?$/
    );
  if (yesMatch) {
    const totalPeople =
      yesMatch[2]
        ? Math.max(
            1,
            Math.min(
              21,
              Number(yesMatch[2])
            )
          )
        : 1;
    return {
      action: "attending" as const,
      guestCount: totalPeople - 1,
    };
  }
  if (
    /^(NEI|KAN IKKE|MELD AV|AVMELD)$/.test(
      normalized
    )
  ) {
    return {
      action: "declined" as const,
      guestCount: 0,
    };
  }
  return {
    action: "unrecognized" as const,
    guestCount: 0,
  };
}
function formatDateNorwegian(
  isoDate: string | null
) {
  if (!isoDate) {
    return "";
  }
  const [year, month, day] =
    isoDate
      .split("-")
      .map(Number);
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).toLocaleDateString(
    "nb-NO",
    {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
}
function formatTime(
  timeValue: string | null
) {
  if (!timeValue) {
    return "";
  }
  return timeValue.slice(
    0,
    5
  );
}
function todayInOslo() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Europe/Oslo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(
      new Date()
    );
  const map:
    Record<string, string> = {};
  for (
    const part
    of parts
  ) {
    map[part.type] =
      part.value;
  }
  return (
    `${map.year}-` +
    `${map.month}-` +
    `${map.day}`
  );
}
async function sendConfirmationSms(
  phone: string,
  message: string
) {
  if (
    !SVEVE_USER ||
    !SVEVE_API_KEY
  ) {
    console.error(
      "Kan ikke sende SMS-bekreftelse: Sveve secrets mangler."
    );
    return {
      ok: false,
      error: "Sveve-oppsett mangler",
    };
  }
  const payload = {
    user: SVEVE_USER,
    passwd: SVEVE_API_KEY,
    to: phone,
    msg: message,
    from: SVEVE_SENDER_TEXT,
    f: "json",
    reply: false,
  };
  try {
    const response =
      await fetch(
        "https://sveve.no/SMS/SendMessage",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
          },
          body:
            JSON.stringify(
              payload
            ),
        }
      );
    const text =
      await response.text();
    let data: any;
    try {
      data =
        JSON.parse(text);
    } catch {
      data = {
        raw: text,
      };
    }
    const fatalError =
      data?.response
        ?.fatalError;
    if (
      !response.ok ||
      fatalError
    ) {
      console.error(
        "Bekreftelses-SMS feilet:",
        {
          status:
            response.status,
          data,
        }
      );
      return {
        ok: false,
        error:
          fatalError ||
          `HTTP ${response.status}`,
      };
    }
    return {
      ok: true,
    };
  } catch (error) {
    console.error(
      "Bekreftelses-SMS feilet:",
      error
    );
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}
Deno.serve(async (req) => {
  try {
    const url =
      new URL(req.url);
    const queryToken =
      url.searchParams.get(
        "token"
      ) || "";
    const pathParts =
      url.pathname
        .split("/")
        .filter(Boolean);
    const functionNameIndex =
      pathParts.indexOf(
        "receive-sms-reply"
      );
    let pathToken = "";
    if (
      functionNameIndex >= 0 &&
      pathParts.length >
        functionNameIndex + 1
    ) {
      pathToken =
        decodeURIComponent(
          pathParts[
            functionNameIndex + 1
          ]
        );
    }
    const suppliedToken =
      queryToken ||
      pathToken;
    if (!REPLY_TOKEN) {
      console.error(
        "SVEVE_REPLY_TOKEN mangler."
      );
      return new Response(
        "Server configuration error",
        {
          status: 500,
        }
      );
    }
    if (
      suppliedToken !==
      REPLY_TOKEN
    ) {
      console.error(
        "SMS webhook avvist: token mangler eller er feil."
      );
      return new Response(
        "Unauthorized",
        {
          status: 401,
        }
      );
    }
    let msg = "";
    let number = "";
    let id = "";
    if (
      req.method === "GET"
    ) {
      msg =
        url.searchParams.get(
          "msg"
        ) || "";
      number =
        url.searchParams.get(
          "number"
        ) || "";
      id =
        url.searchParams.get(
          "id"
        ) || "";
    } else if (
      req.method === "POST"
    ) {
      const contentType =
        req.headers.get(
          "content-type"
        ) || "";
      if (
        contentType.includes(
          "application/x-www-form-urlencoded"
        )
      ) {
        const form =
          await req.formData();
        msg =
          String(
            form.get("msg") || ""
          );
        number =
          String(
            form.get("number") || ""
          );
        id =
          String(
            form.get("id") || ""
          );
      } else {
        const body =
          await req
            .json()
            .catch(
              () => ({})
            );
        msg =
          String(
            body.msg || ""
          );
        number =
          String(
            body.number || ""
          );
        id =
          String(
            body.id || ""
          );
      }
    } else {
      return new Response(
        "Method not allowed",
        {
          status: 405,
        }
      );
    }
    msg =
      msg.trim();
    const phone =
      normalizeNorwegianMobile(
        number
      );
    const sveveId =
      /^\d+$/.test(id)
        ? Number(id)
        : null;
    if (
      !msg ||
      !phone
    ) {
      console.error(
        "SMS webhook mangler data."
      );
      return new Response(
        "Missing msg or number",
        {
          status: 400,
        }
      );
    }
    let admin =
      createClient(
        SUPABASE_URL,
        SECRET_KEY,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        }
      );
    let replyClub='00000000-0000-4000-8000-000000000001';
    let smsMessageId:
      string | null =
      null;
    let matchedPersonId:
      string | null =
      null;
    let eventId:
      string | null =
      null;
    if (sveveId) {
      const {
        data: sent,
        error: sentError,
      } =
        await admin
          .from(
            "sms_messages"
          )
          .select(
            "id,person_id,campaign_id,club_id"
          )
          .eq(
            "sveve_message_id",
            sveveId
          )
          .maybeSingle();
      if (sentError) {
        console.error(
          "Feil ved oppslag av SMS:",
          sentError
        );
      }
      if (sent) {
        replyClub=sent.club_id;
        admin=createClubClient(replyClub);
        smsMessageId =
          sent.id;
        matchedPersonId =
          sent.person_id ||
          null;
        const {
          data: campaign,
          error:
            campaignError,
        } =
          await admin
            .from(
              "sms_campaigns"
            )
            .select(
              "event_id"
            )
            .eq(
              "id",
              sent.campaign_id
            )
            .maybeSingle();
        if (
          campaignError
        ) {
          console.error(
            "Feil ved oppslag av SMS-kampanje:",
            campaignError
          );
        }
        eventId =
          campaign
            ?.event_id ||
          null;
      }
    }
    admin=createClubClient(replyClub);
    if (
      !matchedPersonId
    ) {
      const {
        data: people,
        error:
          personError,
      } =
        await admin
          .from("persons")
          .select(
            "id,phone"
          );
      if (
        personError
      ) {
        console.error(
          "Feil ved personoppslag:",
          personError
        );
      }
      if (people) {
        const person =
          people.find(
            (p) =>
              normalizeNorwegianMobile(
                String(
                  p.phone ||
                  ""
                )
              ) ===
              phone
          );
        if (person) {
          matchedPersonId =
            person.id;
        }
      }
    }
    const interpretation =
      interpretReply(
        msg
      );
    let autoProcessed =
      false;
    let processingNote =
      "";
    if (
      interpretation.action !==
        "unrecognized" &&
      matchedPersonId &&
      eventId
    ) {
      const {
        data:
          eventData,
        error:
          eventError,
      } =
        await admin
          .from("events")
          .select(
            "id,title,event_date,start_time,registration_deadline,status"
          )
          .eq(
            "id",
            eventId
          )
          .maybeSingle();
      if (
        eventError
      ) {
        console.error(
          "Kunne ikke hente arrangement:",
          eventError
        );
        processingNote =
          "Kunne ikke hente arrangementet.";
      } else if (
        !eventData
      ) {
        processingNote =
          "Arrangementet finnes ikke.";
      } else if (
        eventData.status !==
        "planned"
      ) {
        processingNote =
          "Arrangementet er ikke åpent for påmelding.";
        await sendConfirmationSms(
          phone,
          `Arrangementet «${eventData.title}» er ikke åpent for påmelding. Hilsen Oslo Førerhundklubb.`
        );
      } else {
        const today =
          todayInOslo();
        const deadline =
          eventData.registration_deadline;
        /*
         * Fristen gjelder til og med
         * selve datoen.
         *
         * Eksempel:
         * frist 10. september:
         * JA/NEI virker hele 10. september.
         * Fra 11. september blir status
         * ikke endret.
         */
        const deadlinePassed =
          Boolean(
            deadline &&
            today > deadline
          );
        if (
          deadlinePassed
        ) {
          processingNote =
            "Påmeldingsfristen er utløpt.";
          await sendConfirmationSms(
            phone,
            `Påmeldingsfristen for «${eventData.title}» gikk ut ${formatDateNorwegian(deadline)}. Påmeldingen din er ikke endret. Hilsen Oslo Førerhundklubb.`
          );
        } else {
          const newStatus =
            interpretation.action;
          const guestCount =
            newStatus ===
            "attending"
              ? interpretation
                  .guestCount
              : 0;
          const {
            error:
              participantError,
          } =
            await admin
              .from(
                "event_participants"
              )
              .upsert(
                {
                  event_id:
                    eventId,
                  person_id:
                    matchedPersonId,
                  status:
                    newStatus,
                  guest_count:
                    guestCount,
                  note:
                    "Automatisk registrert fra SMS-svar",
                },
                {
                  onConflict:
                    "event_id,person_id",
                }
              );
          if (
            participantError
          ) {
            console.error(
              "Kunne ikke oppdatere deltaker:",
              participantError
            );
            processingNote =
              "Kunne ikke oppdatere deltakerstatus.";
          } else {
            autoProcessed =
              true;
            if (
              newStatus ===
              "attending"
            ) {
              processingNote =
                "Automatisk påmeldt.";
              const extraText =
                guestCount > 0
                  ? ` Du er registrert med ${guestCount} ekstra deltaker${guestCount === 1 ? "" : "e"}.`
                  : "";
              await sendConfirmationSms(
                phone,
                `Du er påmeldt «${eventData.title}» ${formatDateNorwegian(eventData.event_date)} kl. ${formatTime(eventData.start_time)}.${extraText} Hilsen Oslo Førerhundklubb.`
              );
            } else {
              processingNote =
                "Automatisk avmeldt.";
              await sendConfirmationSms(
                phone,
                `Du er registrert som avmeldt fra «${eventData.title}». Hilsen Oslo Førerhundklubb.`
              );
            }
          }
        }
      }
    } else if (
      interpretation.action ===
      "unrecognized"
    ) {
      processingNote =
        "Svaret ble lagret som fritekst og ikke tolket automatisk.";
    } else if (
      !matchedPersonId
    ) {
      processingNote =
        "Telefonnummeret kunne ikke kobles til en person.";
    } else if (
      !eventId
    ) {
      processingNote =
        "Svaret kunne ikke kobles til et arrangement.";
    }
    /*
     * Originalmeldingen lagres alltid,
     * også når automatikken ikke gjør
     * noen endring.
     */
    const {
      error:
        insertError,
    } =
      await admin
        .from(
          "sms_replies"
        )
        .insert({
          sms_message_id:
            smsMessageId,
          sveve_message_id:
            sveveId,
          phone,
          message:
            msg,
          matched_person_id:
            matchedPersonId,
          event_id:
            eventId,
          interpreted_action:
            interpretation.action,
          auto_processed:
            autoProcessed,
          processing_note:
            processingNote,
        });
    if (
      insertError
    ) {
      console.error(
        "Kunne ikke lagre SMS-svar:",
        insertError
      );
      return new Response(
        "Database error",
        {
          status: 500,
        }
      );
    }
    console.log(
      "SMS-svar lagret",
      {
        phone,
        sveveId,
        smsMessageId,
        matchedPersonId,
        eventId,
        interpretedAction:
          interpretation.action,
        autoProcessed,
        processingNote,
      }
    );
    return new Response(
      "OK",
      {
        status: 200,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "receive-sms-reply error:",
      error
    );
    return new Response(
      "Internal error",
      {
        status: 500,
      }
    );
  }
});