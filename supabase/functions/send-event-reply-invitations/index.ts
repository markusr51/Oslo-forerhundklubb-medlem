import { createClient, servePortal } from "../_shared/portal-scope.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || "";

const SECRET_KEYS =
  JSON.parse(
    Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
  );

const SECRET_KEY =
  SECRET_KEYS.default || "";

const PUBLISHABLE_KEYS =
  JSON.parse(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"
  );

const PUBLISHABLE_KEY =
  PUBLISHABLE_KEYS.default ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  "";

const RESEND_API_KEY =
  Deno.env.get("RESEND_API_KEY") || "";

const INBOUND_DOMAIN =
  "anteapeut.resend.app";

const FROM_ADDRESS =
  "Oslo Førerhundklubb <post@osloforerhundklubb.no>";

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


function makeToken() {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(
    bytes
  );

  const binary =
    Array.from(bytes)
      .map(
        byte =>
          String.fromCharCode(
            byte
          )
      )
      .join("");

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


async function sha256Hex(
  value: string
) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",

      new TextEncoder()
        .encode(value)
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


async function sendEmail(
  to: string,
  subject: string,
  text: string,
  replyTo: string
) {
  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            from:
              FROM_ADDRESS,

            to: [
              to,
            ],

            subject,

            text,

            reply_to:
              replyTo,
          }),
      }
    );

  if (!response.ok) {
    console.error(
      "Resend-feil:",
      to,
      await response
        .text()
        .catch(
          () => ""
        )
    );
  }

  return response.ok;
}


servePortal(
  async (
    req
  ) => {

    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );
    }


    if (
      req.method !==
      "POST"
    ) {
      return json(
        {
          success:
            false,

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
        ) || "";


      if (
        !authHeader.startsWith(
          "Bearer "
        )
      ) {
        return json(
          {
            success:
              false,

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


      /*
       * Kontroller innlogget bruker.
       */
      const {
        data: {
          user,
        },

        error:
          userError,
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
            success:
              false,

            error:
              "Ugyldig innlogging.",
          },
          401
        );
      }


      /*
       * Bare administrator/systemadministrator
       * kan sende disse invitasjonene.
       */
      const {
        data:
          appUser,

        error:
          appUserError,
      } =
        await admin
          .from(
            "app_users"
          )
          .select(
            "app_role,active"
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();


      if (
        appUserError ||
        !appUser ||
        appUser.active !==
          true ||
        ![
          "admin",
          "system_admin",
        ].includes(
          appUser.app_role
        )
      ) {
        return json(
          {
            success:
              false,

            error:
              "Ingen administratortilgang.",
          },
          403
        );
      }


      const body =
        await req.json();


      const eventId =
        String(
          body.eventId ||
          ""
        );


      const personIds =
        Array.isArray(
          body.personIds
        )
          ? body.personIds
          : [];


      const subject =
        String(
          body.subject ||
          ""
        )
          .trim();


      const message =
        String(
          body.message ||
          ""
        )
          .trim();


      if (
        !eventId ||
        personIds.length ===
          0
      ) {
        return json(
          {
            success:
              false,

            error:
              "Arrangement eller mottakere mangler.",
          },
          400
        );
      }


      /*
       * Arrangementet må eksplisitt tillate
       * hurtigpåmelding via e-post.
       */
      const {
        data:
          eventRow,

        error:
          eventError,
      } =
        await admin
          .from(
            "events"
          )
          .select(
            `
            id,
            title,
            event_date,
            registration_deadline,
            allow_email_reply_registration,
            registration_form_enabled
            `
          )
          .eq(
            "id",
            eventId
          )
          .maybeSingle();


      if (
        eventError ||
        !eventRow
      ) {
        return json(
          {
            success:
              false,

            error:
              "Arrangementet finnes ikke.",
          },
          404
        );
      }


      if (
        !eventRow
          .allow_email_reply_registration
      ) {
        return json(
          {
            success:
              false,

            error:
              "Hurtigpåmelding via e-post er ikke aktivert for arrangementet.",
          },
          400
        );
      }


      /*
       * Arrangement som bruker eget
       * registreringsskjema skal ikke kunne
       * omgå dette med et enkelt JA.
       */
      if (
        eventRow
          .registration_form_enabled
      ) {
        return json(
          {
            success:
              false,

            error:
              "Arrangementet bruker påmeldingsskjema og kan derfor ikke bruke JA/NEI-hurtigpåmelding.",
          },
          400
        );
      }


      /*
       * Hent mottakerne.
       */
      const {
        data:
          people,

        error:
          peopleError,
      } =
        await admin
          .from(
            "persons"
          )
          .select(
            "id,full_name,email"
          )
          .in(
            "id",
            personIds
          );


      if (
        peopleError
      ) {
        return json(
          {
            success:
              false,

            error:
              "Mottakerne kunne ikke hentes.",
          },
          500
        );
      }


      let sent =
        0;

      let failed =
        0;

      let skipped =
        0;


      for (
        const person
        of people ||
        []
      ) {

        const email =
          String(
            person.email ||
            ""
          )
            .trim()
            .toLowerCase();


        if (!email) {
          skipped +=
            1;

          continue;
        }


        /*
         * Lag helt ny personlig token.
         */
        const token =
          makeToken();


        const tokenHash =
          await sha256Hex(
            token
          );


        /*
         * Token gjelder frem til
         * påmeldingsfristen.
         *
         * Hvis ingen frist finnes,
         * gjelder den til dagen etter arrangementet.
         */
        let expiresAt:
          string;


        if (
          eventRow
            .registration_deadline
        ) {
          expiresAt =
            new Date(
              eventRow
                .registration_deadline +
              "T23:59:59"
            )
              .toISOString();

        } else {

          const eventEnd =
            new Date(
              eventRow
                .event_date +
              "T23:59:59"
            );

          eventEnd.setDate(
            eventEnd.getDate() +
            1
          );

          expiresAt =
            eventEnd
              .toISOString();
        }


        /*
         * Gamle aktive svaradresser for samme
         * person/arrangement deaktiveres.
         */
        const {
          error:
            deactivateError,
        } =
          await admin
            .from(
              "event_email_reply_tokens"
            )
            .update({
              active:
                false,
            })
            .eq(
              "event_id",
              eventId
            )
            .eq(
              "person_id",
              person.id
            )
            .eq(
              "active",
              true
            );


        if (
          deactivateError
        ) {
          console.error(
            "Kunne ikke deaktivere tidligere token:",
            deactivateError
          );
        }


        /*
         * Bare hashen lagres i databasen.
         */
        const {
          error:
            tokenError,
        } =
          await admin
            .from(
              "event_email_reply_tokens"
            )
            .insert({
              event_id:
                eventId,

              person_id:
                person.id,

              expected_email:
                email,

              token_hash:
                tokenHash,

              active:
                true,

              expires_at:
                expiresAt,
            });


        if (
          tokenError
        ) {
          console.error(
            "Token kunne ikke lagres:",
            person.id,
            tokenError
          );

          failed +=
            1;

          continue;
        }


        const replyTo =
          `arr-${token}@${INBOUND_DOMAIN}`;


        /*
         * Vi legger automatisk til
         * instruksjonen nederst.
         */
        const emailText =
`${message}

Du kan melde deg på ved å svare på denne e-posten.

Du kan for eksempel skrive:
JA
Ja takk, jeg kommer.
Jeg blir med.

Hvis du ikke skal delta, kan du for eksempel skrive:
NEI
Nei takk.
Jeg kommer ikke.

Du vil få en bekreftelse på e-post og SMS når svaret er registrert.

Med vennlig hilsen
Oslo Førerhundklubb`;


        const ok =
          await sendEmail(
            email,
            subject ||
              eventRow.title,
            emailText,
            replyTo
          );


        if (ok) {
          sent +=
            1;

        } else {
          failed +=
            1;

          /*
           * Dersom selve e-posten feiler,
           * deaktiver tokenet igjen.
           */
          await admin
            .from(
              "event_email_reply_tokens"
            )
            .update({
              active:
                false,
            })
            .eq(
              "token_hash",
              tokenHash
            );
        }
      }


      return json({
        success:
          true,

        sent,

        failed,

        skipped,

        total:
          personIds.length,
      });

    } catch (
      error
    ) {

      console.error(
        "send-event-reply-invitations:",
        error
      );


      return json(
        {
          success:
            false,

          error:
            error instanceof
            Error

              ? error.message

              : String(
                  error
                ),
        },
        500
      );
    }
  }
);