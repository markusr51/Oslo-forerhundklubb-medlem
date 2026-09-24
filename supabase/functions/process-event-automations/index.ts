import { createClubClient } from "../_shared/portal-scope.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(
  Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
);
const SECRET_KEY = secretKeys.default;
const EVENT_AUTOMATION_TOKEN =
  Deno.env.get("EVENT_AUTOMATION_TOKEN") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SVEVE_USER = Deno.env.get("SVEVE_USER")!;
const SVEVE_API_KEY = Deno.env.get("SVEVE_API_KEY")!;
const SVEVE_SENDER_TEXT =
  Deno.env.get("SVEVE_SENDER_TEXT") || "Oslo FHK";
const FROM_ADDRESS =
  "Oslo Førerhundklubb <post@osloforerhundklubb.no>";
const REPLY_TO =
  "post@osloforerhundklubb.no";
function normalizePhone(value: string) {
  let n = String(value || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+47")) {
    n = n.slice(3);
  } else if (n.startsWith("0047")) {
    n = n.slice(4);
  }
  return /^\d{8}$/.test(n)
    ? n
    : null;
}
function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );
}
function osloParts() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Oslo",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
        hour:
          "2-digit",
        hourCycle:
          "h23",
      }
    ).formatToParts(
      new Date()
    );
  const map:
    Record<string,string> =
    {};
  for (
    const part
    of parts
  ) {
    map[
      part.type
    ] =
      part.value;
  }
  return {
    date:
      `${map.year}-${map.month}-${map.day}`,
    hour:
      Number(
        map.hour
      ),
  };
}
function addDays(
  isoDate: string,
  days: number
) {
  const [
    year,
    month,
    day,
  ] =
    isoDate
      .split("-")
      .map(Number);
  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );
  date.setUTCDate(
    date.getUTCDate() +
    days
  );
  return date
    .toISOString()
    .slice(0,10);
}
async function sendEmail(
  email: string,
  subject: string,
  text: string
) {
  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method:
          "POST",
        headers: {
          "Authorization":
            `Bearer ${RESEND_API_KEY}`,
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            from:
              FROM_ADDRESS,
            to: [
              email,
            ],
            subject,
            text,
            reply_to:
              REPLY_TO,
          }),
      }
    );
  if (
    !response.ok
  ) {
    console.error(
      "E-post feilet",
      {
        email,
        status:
          response.status,
        body:
          await response
            .text()
            .catch(
              () => ""
            ),
      }
    );
  }
  return response.ok;
}
async function sendSms(
  phone: string,
  text: string,
  reply: boolean
) {
  const payload:
    Record<
      string,
      unknown
    > = {
    user:
      SVEVE_USER,
    passwd:
      SVEVE_API_KEY,
    to:
      phone,
    msg:
      text,
    f:
      "json",
    reply,
  };
  if (
    !reply
  ) {
    payload.from =
      SVEVE_SENDER_TEXT;
  }
  const response =
    await fetch(
      "https://sveve.no/SMS/SendMessage",
      {
        method:
          "POST",
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
  const body =
    await response
      .text()
      .catch(
        () => ""
      );
  let parsed:
    any =
    null;
  try {
    parsed =
      JSON.parse(
        body
      );
  } catch {}
  const fatal =
    parsed
      ?.response
      ?.fatalError;
  if (
    !response.ok ||
    fatal
  ) {
    console.error(
      "SMS feilet",
      {
        phone,
        status:
          response.status,
        body:
          parsed ||
          body,
      }
    );
    return false;
  }
  return true;
}
async function logCommunication(
  admin: any,
  rule: any,
  eventData: any,
  channel: "sms" | "email",
  recipientCount: number,
  sentCount: number,
  failedCount: number,
  subject: string | null,
  message: string
) {
  const status =
    sentCount === 0 &&
    failedCount > 0
      ? "failed"
      : failedCount > 0
        ? "partial"
        : "sent";
  const audienceLabel =
    rule.target_type ===
      "role"
      ? "Valgt rolle"
      : rule.target_type ===
        "group"
        ? "Valgt gruppe/utvalg"
        : "Alle aktive personer";
  const {
    error,
  } =
    await admin
      .from(
        "communication_history"
      )
      .insert({
        event_id:
          eventData.id,
        source:
          "automatic",
        automation_rule_id:
          rule.id,
        channel,
        audience_type:
          rule.target_type ||
          "all",
        audience_label:
          audienceLabel,
        subject,
        message,
        recipient_count:
          recipientCount,
        sent_count:
          sentCount,
        failed_count:
          failedCount,
        status,
        created_at:
          new Date()
            .toISOString(),
        completed_at:
          new Date()
            .toISOString(),
        details: {
          rule_type:
            rule.rule_type,
          days_before:
            rule.days_before,
          send_hour:
            rule.send_hour,
        },
      });
  if (
    error
  ) {
    console.error(
      "Kunne ikke logge kommunikasjonshistorikk:",
      error
    );
  }
}
Deno.serve(
  async (
    req
  ) => {
    if (
      !EVENT_AUTOMATION_TOKEN
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Server configuration error",
        }),
        {
          status:
            500,
        }
      );
    }
    if (
      (
        req.headers.get(
          "x-automation-token"
        ) ||
        ""
      ) !==
      EVENT_AUTOMATION_TOKEN
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Unauthorized",
        }),
        {
          status:
            401,
        }
      );
    }
    try {
      const admin =
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
      const now =
        osloParts();
      console.log(
        "Starter automatiseringsrunde",
        {
          osloDate:
            now.date,
          osloHour:
            now.hour,
        }
      );
      const {
        data:
          rules,
        error:
          rulesError,
      } =
        await admin
          .from(
            "event_automation_rules"
          )
          .select(
            "*"
          )
          .eq(
            "enabled",
            true
          );
      if (
        rulesError
      ) {
        console.error(
          "Kunne ikke hente automatiseringsregler:",
          rulesError
        );
        return new Response(
          JSON.stringify({
            error:
              rulesError.message,
          }),
          {
            status:
              500,
          }
        );
      }
      const processed:
        any[] =
        [];
      const skipped:
        any[] =
        [];
      for (
        const rule
        of (
          rules ||
          []
        )
      ) {
        const admin=createClubClient(rule.club_id);
        if (
          rule.last_sent_at
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              "already_sent",
          });
          continue;
        }
        const {
          data:
            eventData,
          error:
            eventError,
        } =
          await admin
            .from(
              "events"
            )
            .select(
              "id,title,event_date,start_time,registration_deadline,status"
            )
            .eq(
              "id",
              rule.event_id
            )
            .maybeSingle();
        if (
          eventError ||
          !eventData
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              eventError
                ? "event_lookup_error"
                : "event_not_found",
            error:
              eventError
                ?.message ||
              null,
          });
          continue;
        }
        if (
          eventData.status !==
          "planned"
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              "event_not_planned",
          });
          continue;
        }
        const sendDate =
          addDays(
            eventData.event_date,
            -Number(
              rule.days_before
            )
          );
        if (
          sendDate !==
          now.date
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              "wrong_date",
            calculatedSendDate:
              sendDate,
            osloDate:
              now.date,
          });
          continue;
        }
        if (
          Number(
            rule.send_hour
          ) !==
          now.hour
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              "wrong_hour",
            sendHour:
              rule.send_hour,
            osloHour:
              now.hour,
          });
          continue;
        }
        if (
          rule.rule_type ===
            "pending_reminder" &&
          eventData
            .registration_deadline &&
          now.date >
            eventData
              .registration_deadline
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              "registration_deadline_passed",
          });
          continue;
        }
        let baseIds:
          string[] |
          null =
          null;
        if (
          rule.target_type ===
          "role"
        ) {
          if (
            !rule
              .target_role_id
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "missing_target_role",
            });
            continue;
          }
          const {
            data:
              roleRows,
            error:
              roleError,
          } =
            await admin
              .from(
                "person_roles"
              )
              .select(
                "person_id"
              )
              .eq(
                "role_id",
                rule
                  .target_role_id
              )
              .eq(
                "is_active",
                true
              );
          if (
            roleError
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "role_lookup_error",
              error:
                roleError.message,
            });
            continue;
          }
          baseIds =
            (
              roleRows ||
              []
            ).map(
              (
                x:
                  any
              ) =>
                x.person_id
            );
        }
        if (
          rule.target_type ===
          "group"
        ) {
          if (
            !rule
              .target_group_id
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "missing_target_group",
            });
            continue;
          }
          const {
            data:
              groupRows,
            error:
              groupError,
          } =
            await admin
              .from(
                "group_members"
              )
              .select(
                "person_id"
              )
              .eq(
                "group_id",
                rule
                  .target_group_id
              );
          if (
            groupError
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "group_lookup_error",
              error:
                groupError.message,
            });
            continue;
          }
          baseIds =
            (
              groupRows ||
              []
            ).map(
              (
                x:
                  any
              ) =>
                x.person_id
            );
        }
        let personIds:
          string[] |
          null =
          baseIds;
        if (
          rule.rule_type ===
          "pending_reminder"
        ) {
          const {
            data:
              participantRows,
            error:
              participantError,
          } =
            await admin
              .from(
                "event_participants"
              )
              .select(
                "person_id,status"
              )
              .eq(
                "event_id",
                rule.event_id
              );
          if (
            participantError
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "participant_lookup_error",
              error:
                participantError.message,
            });
            continue;
          }
          const statusMap =
            new Map(
              (
                participantRows ||
                []
              ).map(
                (
                  x:
                    any
                ) => [
                  x.person_id,
                  x.status,
                ]
              )
            );
          if (
            baseIds ===
            null
          ) {
            const {
              data:
                activeRows,
              error:
                activeError,
            } =
              await admin
                .from(
                  "persons"
                )
                .select(
                  "id"
                )
                .eq(
                  "membership_status",
                  "active"
                );
            if (
              activeError
            ) {
              skipped.push({
                ruleId:
                  rule.id,
                reason:
                  "active_people_lookup_error",
                error:
                  activeError.message,
              });
              continue;
            }
            personIds =
              (
                activeRows ||
                []
              )
                .map(
                  (
                    x:
                      any
                  ) =>
                    x.id
                )
                .filter(
                  (
                    id:
                      string
                  ) =>
                    !statusMap
                      .has(
                        id
                      ) ||
                    statusMap
                      .get(
                        id
                      ) ===
                      "pending"
                );
          } else {
            personIds =
              baseIds.filter(
                id =>
                  !statusMap
                    .has(
                      id
                    ) ||
                  statusMap
                    .get(
                      id
                    ) ===
                    "pending"
              );
          }
        }
        if (
          rule.rule_type ===
          "attending_reminder"
        ) {
          const {
            data:
              attendingRows,
            error:
              attendingError,
          } =
            await admin
              .from(
                "event_participants"
              )
              .select(
                "person_id"
              )
              .eq(
                "event_id",
                rule.event_id
              )
              .eq(
                "status",
                "attending"
              );
          if (
            attendingError
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "attendees_lookup_error",
              error:
                attendingError.message,
            });
            continue;
          }
          const attendingIds =
            (
              attendingRows ||
              []
            ).map(
              (
                x:
                  any
              ) =>
                x.person_id
            );
          if (
            baseIds ===
            null
          ) {
            personIds =
              attendingIds;
          } else {
            const allowed =
              new Set(
                baseIds
              );
            personIds =
              attendingIds
                .filter(
                  id =>
                    allowed
                      .has(
                        id
                      )
                );
          }
        }
        let people:
          any[] =
          [];
        if (
          personIds ===
          null
        ) {
          const {
            data:
              activePeople,
            error:
              activeError,
          } =
            await admin
              .from(
                "persons"
              )
              .select(
                "id,full_name,email,phone,membership_status"
              )
              .eq(
                "membership_status",
                "active"
              );
          if (
            activeError
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "recipient_lookup_error",
              error:
                activeError.message,
            });
            continue;
          }
          people =
            activePeople ||
            [];
        } else if (
          personIds.length >
          0
        ) {
          const {
            data:
              selectedPeople,
            error:
              selectedError,
          } =
            await admin
              .from(
                "persons"
              )
              .select(
                "id,full_name,email,phone,membership_status"
              )
              .in(
                "id",
                personIds
              );
          if (
            selectedError
          ) {
            skipped.push({
              ruleId:
                rule.id,
              reason:
                "recipient_lookup_error",
              error:
                selectedError.message,
            });
            continue;
          }
          people =
            selectedPeople ||
            [];
        }
        const smsText =
          String(
            rule.sms_message ||
            rule.message ||
            ""
          ).trim();
        const emailSubject =
          String(
            rule.email_subject ||
            rule.subject ||
            eventData.title
          ).trim();
        const emailText =
          String(
            rule.email_message ||
            rule.message ||
            ""
          ).trim();
        if (
          (
            rule.channel ===
              "sms" ||
            rule.channel ===
              "both"
          ) &&
          !smsText
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              "missing_sms_message",
          });
          continue;
        }
        if (
          (
            rule.channel ===
              "email" ||
            rule.channel ===
              "both"
          ) &&
          (
            !emailSubject ||
            !emailText
          )
        ) {
          skipped.push({
            ruleId:
              rule.id,
            reason:
              "missing_email_content",
          });
          continue;
        }
        console.log(
          "Regel matcher og skal behandles",
          {
            ruleId:
              rule.id,
            ruleType:
              rule.rule_type,
            targetType:
              rule.target_type,
            recipients:
              people.length,
            channel:
              rule.channel,
          }
        );
        let emailSent =
          0;
        let emailFailed =
          0;
        let smsSent =
          0;
        let smsFailed =
          0;
        for (
          const person
          of people
        ) {
          if (
            (
              rule.channel ===
                "email" ||
              rule.channel ===
                "both"
            ) &&
            validEmail(
              person.email
            )
          ) {
            if (
              await sendEmail(
                person.email,
                emailSubject,
                emailText
              )
            ) {
              emailSent++;
            } else {
              emailFailed++;
            }
          }
          if (
            rule.channel ===
              "sms" ||
            rule.channel ===
              "both"
          ) {
            const p =
              normalizePhone(
                person.phone
              );
            if (
              p
            ) {
              if (
                await sendSms(
                  p,
                  smsText,
                  Boolean(
                    rule.sms_reply
                  )
                )
              ) {
                smsSent++;
              } else {
                smsFailed++;
              }
            }
          }
        }
        if (
          rule.channel ===
            "email" ||
          rule.channel ===
            "both"
        ) {
          const emailEligible =
            people.filter(
              (
                p:
                  any
              ) =>
                validEmail(
                  p.email
                )
            ).length;
          await logCommunication(
            admin,
            rule,
            eventData,
            "email",
            emailEligible,
            emailSent,
            emailFailed,
            emailSubject,
            emailText
          );
        }
        if (
          rule.channel ===
            "sms" ||
          rule.channel ===
            "both"
        ) {
          const smsEligible =
            people.filter(
              (
                p:
                  any
              ) =>
                normalizePhone(
                  p.phone
                )
            ).length;
          await logCommunication(
            admin,
            rule,
            eventData,
            "sms",
            smsEligible,
            smsSent,
            smsFailed,
            null,
            smsText
          );
        }
        const {
          error:
            updateError,
        } =
          await admin
            .from(
              "event_automation_rules"
            )
            .update({
              last_sent_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              "id",
              rule.id
            );
        if (
          updateError
        ) {
          console.error(
            "Kunne ikke merke regelen som sendt:",
            updateError
          );
        }
        const summary = {
          ruleId:
            rule.id,
          eventId:
            eventData.id,
          eventTitle:
            eventData.title,
          ruleType:
            rule.rule_type,
          targetType:
            rule.target_type,
          recipientCount:
            people.length,
          emailSent,
          emailFailed,
          smsSent,
          smsFailed,
        };
        processed.push(
          summary
        );
        console.log(
          "Automatisk utsendelse ferdig:",
          summary
        );
      }
      return new Response(
        JSON.stringify({
          success:
            true,
          osloDate:
            now.date,
          osloHour:
            now.hour,
          processed,
          skipped,
        }),
        {
          status:
            200,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );
    } catch (
      error
    ) {
      console.error(
        "process-event-automations error:",
        error
      );
      return new Response(
        JSON.stringify({
          error:
            error instanceof
            Error
              ? error.message
              : String(
                  error
                ),
        }),
        {
          status:
            500,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );
    }
  }
);