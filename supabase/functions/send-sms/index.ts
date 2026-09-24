import { createClient, servePortal, validateMessageScope } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const publishableKeys = JSON.parse(
  Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"
);

const secretKeys = JSON.parse(
  Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
);

const PUBLISHABLE_KEY = publishableKeys.default;
const SECRET_KEY = secretKeys.default;

const SVEVE_USER = Deno.env.get("SVEVE_USER")!;
const SVEVE_API_KEY = Deno.env.get("SVEVE_API_KEY")!;
const SVEVE_SENDER_TEXT =
  Deno.env.get("SVEVE_SENDER_TEXT") || "Oslo FHK";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

function normalizeNorwegianMobile(
  value: string
) {
  let number =
    value.replace(/[^\d+]/g, "");

  if (number.startsWith("+47")) {
    number = number.slice(3);
  } else if (number.startsWith("0047")) {
    number = number.slice(4);
  }

  return /^\d{8}$/.test(number)
    ? number
    : null;
}

type Recipient = {
  phone: string;
  personId?: string | null;
};

servePortal(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }

  if (req.method !== "POST") {
    return json(
      {
        error:
          "Kun POST er tillatt.",
      },
      405
    );
  }

  try {
    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (
      !authHeader?.startsWith(
        "Bearer "
      )
    ) {
      return json(
        {
          error:
            "Ikke innlogget.",
        },
        401
      );
    }

    const userClient =
      createClient(
        SUPABASE_URL,
        PUBLISHABLE_KEY,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
            },
          },

          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        }
      );

    const adminClient =
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

    const {
      data: { user },
      error: userError,
    } =
      await userClient
        .auth
        .getUser();

    if (
      userError ||
      !user
    ) {
      return json(
        {
          error:
            "Ugyldig innlogging.",
        },
        401
      );
    }

    const {
      data: caller,
      error: callerError,
    } =
      await userClient
        .from("app_users")
        .select(
          "app_role, active"
        )
        .eq(
          "user_id",
          user.id
        )
        .single();

    if (
      callerError ||
      !caller
    ) {
      return json(
        {
          error:
            "Kunne ikke kontrollere portaltilgangen.",
        },
        403
      );
    }

    if (
      caller.active !== true ||
      ![
        "system_admin",
        "admin",
      ].includes(
        caller.app_role
      )
    ) {
      return json(
        {
          error:
            "Du har ikke tilgang til å sende SMS.",
        },
        403
      );
    }

    if (!SVEVE_USER) {
      return json(
        {
          error:
            "SVEVE_USER mangler i Edge Function Secrets.",
        },
        500
      );
    }

    if (!SVEVE_API_KEY) {
      return json(
        {
          error:
            "SVEVE_API_KEY mangler i Edge Function Secrets.",
        },
        500
      );
    }

    const body =
      await req.json();

    const message =
      String(
        body.message || ""
      ).trim();

    const reply =
      body.reply === true;

    const test =
      body.test === true;

    const eventId =
      body.eventId
        ? String(
            body.eventId
          )
        : null;

    const rawRecipients =
      Array.isArray(
        body.recipients
      )
        ? body.recipients
        : [];

    if (!message) {
      return json(
        {
          error:
            "Meldingsteksten mangler.",
        },
        400
      );
    }

    if (
      message.length >
      1071
    ) {
      return json(
        {
          error:
            "Meldingen er for lang. Maksimum er 1071 tegn.",
        },
        400
      );
    }

    if (
      !rawRecipients.length
    ) {
      return json(
        {
          error:
            "Ingen mottakere valgt.",
        },
        400
      );
    }

    if (
      rawRecipients.length >
      500
    ) {
      return json(
        {
          error:
            "For mange mottakere i ett kall.",
        },
        400
      );
    }

    await validateMessageScope(adminClient,eventId,rawRecipients);

    const recipients:
      Recipient[] = [];

    const rejected:
      string[] = [];

    const seen =
      new Set<string>();

    for (
      const raw
      of rawRecipients
    ) {
      const rawPhone =
        typeof raw === "string"
          ? raw
          : String(
              raw?.phone || ""
            );

      const personId =
        typeof raw === "object" &&
        raw
          ? raw.personId ||
            null
          : null;

      const phone =
        normalizeNorwegianMobile(
          rawPhone
        );

      if (!phone) {
        rejected.push(
          rawPhone
        );
        continue;
      }

      if (
        seen.has(phone)
      ) {
        continue;
      }

      seen.add(phone);

      recipients.push({
        phone,
        personId,
      });
    }

    if (
      !recipients.length
    ) {
      return json(
        {
          error:
            "Ingen gyldige norske mobilnumre.",
          rejected,
        },
        400
      );
    }

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
        recipients
          .map(
            (r) => r.phone
          )
          .join(","),

      msg:
        message,

      f:
        "json",

      test,

      reply,
    };

    if (!reply) {
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

    const responseText =
      await response.text();

    let sveveResult:
      any;

    try {
      sveveResult =
        JSON.parse(
          responseText
        );
    }

    catch {
      sveveResult = {
        raw:
          responseText,
      };
    }

    if (
      !response.ok
    ) {
      return json(
        {
          error:
            "Sveve svarte med HTTP-feil.",

          status:
            response.status,

          sveve:
            sveveResult,
        },
        502
      );
    }

    const sveveResponse =
      sveveResult?.response ||
      {};

    if (
      sveveResponse.fatalError
    ) {
      return json(
        {
          error:
            "Sveve: " +
            sveveResponse.fatalError,

          sveve:
            sveveResult,
        },
        400
      );
    }

    const ids:
      Array<
        number | null
      > =
      Array.isArray(
        sveveResponse.ids
      )
        ? sveveResponse.ids
        : [];

    const msgOkCount =
      Number(
        sveveResponse.msgOkCount ||
          0
      );

    const smsUnits =
      Number(
        sveveResponse.stdSMSCount ||
          0
      );

    if (!test) {
      const {
        data: campaign,
        error:
          campaignError,
      } =
        await adminClient
          .from(
            "sms_campaigns"
          )
          .insert({
            created_by:
              user.id,

            message,

            reply_enabled:
              reply,

            sender_text:
              reply
                ? null
                : SVEVE_SENDER_TEXT,

            recipient_count:
              recipients.length,

            sms_units:
              smsUnits,

            event_id:
              eventId,
          })
          .select("id")
          .single();

      if (
        campaignError ||
        !campaign
      ) {
        console.error(
          "Kunne ikke logge SMS-kampanje",
          campaignError
        );

        return json(
          {
            error:
              "SMS ble behandlet av Sveve, men utsendelsen kunne ikke logges.",

            sveve:
              sveveResult,
          },
          500
        );
      }

      const errorsByNumber =
        new Map<
          string,
          string
        >();

      for (
        const e
        of (
          sveveResponse.errors ||
          []
        )
      ) {
        if (
          e?.number
        ) {
          errorsByNumber.set(
            String(
              e.number
            ),

            String(
              e.message ||
                "Feil"
            )
          );
        }
      }

      const rows =
        recipients.map(
          (r, i) => {
            const id =
              ids[i] &&
              Number(
                ids[i]
              ) !== 0
                ? Number(
                    ids[i]
                  )
                : null;

            const error =
              errorsByNumber.get(
                r.phone
              ) || null;

            return {
              campaign_id:
                campaign.id,

              person_id:
                r.personId ||
                null,

              phone:
                r.phone,

              sveve_message_id:
                id,

              status:
                id
                  ? "sent"
                  : "failed",

              error,
            };
          }
        );

      const {
        error:
          logError,
      } =
        await adminClient
          .from(
            "sms_messages"
          )
          .insert(rows);

      if (
        logError
      ) {
        console.error(
          "Kunne ikke logge enkeltmeldinger",
          logError
        );
      }
    }

    return json({
      success:
        true,

      test,

      reply,

      recipients:
        recipients.length,

      rejected,

      msgOkCount,

      smsUnits,

      eventId,

      sveve:
        sveveResult,
    });
  }

  catch (error) {
    console.error(
      error
    );

    return json(
      {
        error:
          "En intern feil oppstod i send-sms.",
      },
      500
    );
  }
});