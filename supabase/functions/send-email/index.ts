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

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const FROM_ADDRESS =
  "Oslo Førerhundklubb <post@osloforerhundklubb.no>";

const REPLY_TO =
  "post@osloforerhundklubb.no";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type Recipient = {
  email: string;
  personId?: string | null;
  name?: string | null;
};

type Attachment = {
  filename: string;
  content: string;
  contentType?: string | null;
  size?: number | null;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

servePortal(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Kun POST er tillatt." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Ikke innlogget." }, 401);
    }

    const userClient = createClient(
      SUPABASE_URL,
      PUBLISHABLE_KEY,
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const adminClient = createClient(
      SUPABASE_URL,
      SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Ugyldig innlogging." }, 401);
    }

    const { data: caller, error: callerError } = await userClient
      .from("app_users")
      .select("app_role, active")
      .eq("user_id", user.id)
      .single();

    if (callerError || !caller) {
      return json(
        { error: "Kunne ikke kontrollere portaltilgangen." },
        403
      );
    }

    if (
      caller.active !== true ||
      !["system_admin", "admin"].includes(caller.app_role)
    ) {
      return json(
        { error: "Du har ikke tilgang til å sende e-post." },
        403
      );
    }

    if (!RESEND_API_KEY) {
      return json(
        { error: "RESEND_API_KEY mangler i Edge Function Secrets." },
        500
      );
    }

    const body = await req.json();

    const rawRecipients =
      Array.isArray(body.recipients)
        ? body.recipients
        : [];

    const subject =
      String(body.subject || "").trim();

    const text =
      String(body.text || "").trim();

    const test =
      body.test === true;

    const eventId =
      body.eventId
        ? String(body.eventId)
        : null;

    const rawAttachments =
      Array.isArray(body.attachments)
        ? body.attachments
        : [];

    if (!subject) {
      return json({ error: "Emne mangler." }, 400);
    }

    if (!text) {
      return json({ error: "Meldingsteksten mangler." }, 400);
    }

    if (rawRecipients.length === 0) {
      return json({ error: "Ingen mottakere valgt." }, 400);
    }

    if (rawRecipients.length > 500) {
      return json(
        { error: "For mange mottakere i én utsendelse." },
        400
      );
    }

    await validateMessageScope(adminClient,eventId,rawRecipients);

    const recipients: Recipient[] = [];
    const seen = new Set<string>();
    const rejected: string[] = [];

    for (const raw of rawRecipients) {
      const email =
        typeof raw === "string"
          ? raw.trim().toLowerCase()
          : String(raw?.email || "")
              .trim()
              .toLowerCase();

      const personId =
        typeof raw === "object" && raw
          ? raw.personId || null
          : null;

      const name =
        typeof raw === "object" && raw
          ? raw.name || null
          : null;

      if (!validEmail(email)) {
        rejected.push(email);
        continue;
      }

      if (seen.has(email)) {
        continue;
      }

      seen.add(email);

      recipients.push({
        email,
        personId,
        name,
      });
    }

    if (!recipients.length) {
      return json(
        {
          error:
            "Ingen gyldige e-postmottakere.",
          rejected,
        },
        400
      );
    }

    const attachments: Attachment[] = [];
    let totalAttachmentBytes = 0;

    for (const raw of rawAttachments) {
      const filename =
        String(raw?.filename || "").trim();

      const content =
        String(raw?.content || "");

      const contentType =
        String(
          raw?.contentType ||
          "application/octet-stream"
        );

      const size =
        Number(raw?.size || 0);

      if (!filename || !content) {
        return json(
          {
            error:
              "Et vedlegg mangler filnavn eller innhold.",
          },
          400
        );
      }

      if (size > 5 * 1024 * 1024) {
        return json(
          {
            error:
              `Vedlegget «${filename}» er større enn 5 MB.`,
          },
          400
        );
      }

      totalAttachmentBytes += size;

      attachments.push({
        filename,
        content,
        contentType,
        size,
      });
    }

    if (
      totalAttachmentBytes >
      10 * 1024 * 1024
    ) {
      return json(
        {
          error:
            "Vedleggene er større enn 10 MB totalt.",
        },
        400
      );
    }

    let campaignId: string | null = null;

    if (!test) {
      const {
        data: campaign,
        error: campaignError,
      } =
        await adminClient
          .from("email_campaigns")
          .insert({
            created_by:
              user.id,

            subject,

            message:
              text,

            recipient_count:
              recipients.length,

            attachment_count:
              attachments.length,

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
          "Kunne ikke opprette e-postkampanje",
          campaignError
        );

        return json(
          {
            error:
              "Kunne ikke opprette utsendelsesloggen.",
          },
          500
        );
      }

      campaignId =
        campaign.id;
    }

    let sent = 0;
    let failed = 0;

    const results:
      Array<
        Record<
          string,
          unknown
        >
      > = [];

    for (
      let i = 0;
      i < recipients.length;
      i++
    ) {
      const recipient =
        recipients[i];

      const resendPayload:
        Record<
          string,
          unknown
        > = {
        from:
          FROM_ADDRESS,

        to: [
          recipient.email,
        ],

        subject,

        text,

        reply_to:
          REPLY_TO,
      };

      if (
        attachments.length
      ) {
        resendPayload.attachments =
          attachments.map(
            a => ({
              filename:
                a.filename,

              content:
                a.content,

              content_type:
                a.contentType,
            })
          );
      }

      let resendId:
        string |
        null =
        null;

      let errorText:
        string |
        null =
        null;

      try {
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
                JSON.stringify(
                  resendPayload
                ),
            }
          );

        const responseText =
          await response
            .text();

        let result:
          any;

        try {
          result =
            JSON.parse(
              responseText
            );
        } catch {
          result = {
            raw:
              responseText,
          };
        }

        if (
          !response.ok
        ) {
          errorText =
            result?.message ||
            `Resend HTTP ${response.status}`;

          failed++;
        } else {
          resendId =
            result?.id ||
            null;

          sent++;
        }
      } catch (
        error
      ) {
        errorText =
          error instanceof
          Error
            ? error.message
            : String(
                error
              );

        failed++;
      }

      results.push({
        email:
          recipient.email,

        personId:
          recipient.personId ||
          null,

        success:
          !errorText,

        resendId,

        error:
          errorText,
      });

      if (
        !test &&
        campaignId
      ) {
        const {
          error:
            messageLogError,
        } =
          await adminClient
            .from(
              "email_messages"
            )
            .insert({
              campaign_id:
                campaignId,

              person_id:
                recipient.personId ||
                null,

              email:
                recipient.email,

              resend_id:
                resendId,

              status:
                errorText
                  ? "failed"
                  : "sent",

              error:
                errorText,
            });

        if (
          messageLogError
        ) {
          console.error(
            "Kunne ikke logge e-postmelding",
            messageLogError
          );
        }
      }

      if (
        i <
        recipients.length - 1
      ) {
        await sleep(
          550
        );
      }
    }

    if (
      !test &&
      campaignId
    ) {
      const {
        error:
          updateError,
      } =
        await adminClient
          .from(
            "email_campaigns"
          )
          .update({
            sent_count:
              sent,

            failed_count:
              failed,
          })
          .eq(
            "id",
            campaignId
          );

      if (
        updateError
      ) {
        console.error(
          "Kunne ikke oppdatere e-postkampanje",
          updateError
        );
      }
    }

    return json({
      success:
        failed === 0,

      test,

      recipients:
        recipients.length,

      rejected,

      sent,

      failed,

      attachmentCount:
        attachments.length,

      campaignId,

      results,
    });
  } catch (
    error
  ) {
    console.error(
      "send-email error:",
      error
    );

    return json(
      {
        error:
          "En intern feil oppstod i send-email.",
      },
      500
    );
  }
});