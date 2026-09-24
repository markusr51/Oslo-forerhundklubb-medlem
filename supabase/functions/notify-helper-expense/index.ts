import { createClient, servePortal } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const secretKeys =
  JSON.parse(
    Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
  );

const SECRET_KEY =
  secretKeys.default;

const RESEND_API_KEY =
  Deno.env.get("RESEND_API_KEY")!;

const FROM_ADDRESS =
  "Oslo Førerhundklubb <post@osloforerhundklubb.no>";

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-portal-club",
      },
    }
  );
}

servePortal(
  async (
    req
  ) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return json(
        {},
        200
      );
    }

    try {
      const authHeader =
        req.headers.get(
          "Authorization"
        ) ||
        "";

      const caller =
        createClient(
          SUPABASE_URL,
          Deno.env.get(
            "SUPABASE_ANON_KEY"
          ) ||
            "",
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

      const {
        data: {
          user,
        },
      } =
        await caller
          .auth
          .getUser();

      if (
        !user
      ) {
        return json(
          {
            error:
              "Ikke innlogget.",
          },
          401
        );
      }

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

      const body =
        await req.json();

      const expenseId =
        String(
          body.expenseId ||
          ""
        ).trim();

      if (
        !expenseId
      ) {
        return json(
          {
            error:
              "expenseId mangler.",
          },
          400
        );
      }

      const {
        data:
          expense,
        error:
          expenseError,
      } =
        await admin
          .from(
            "helper_expenses"
          )
          .select(
            `
            id,
            person_id,
            expense_date,
            amount,
            description,
            persons (
              full_name,
              email
            )
            `
          )
          .eq(
            "id",
            expenseId
          )
          .maybeSingle();

      if (
        expenseError ||
        !expense
      ) {
        return json(
          {
            error:
              "Utlegget finnes ikke.",
          },
          404
        );
      }

      const {
        data:
          callerRow,
      } =
        await admin
          .from(
            "app_users"
          )
          .select(
            "person_id,app_role,active"
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

      if (
        !callerRow
          ?.active
      ) {
        return json(
          {
            error:
              "Ingen tilgang.",
          },
          403
        );
      }

      const allowed =
        callerRow.app_role ===
          "admin" ||
        callerRow.app_role ===
          "system_admin" ||
        callerRow.person_id ===
          expense.person_id;

      if (
        !allowed
      ) {
        return json(
          {
            error:
              "Ingen tilgang til dette utlegget.",
          },
          403
        );
      }

      const name =
        expense.persons
          ?.full_name ||
        "bruker";

      const subject =
        `Nytt utlegg registrert – ${name}`;

      const text =
`Det er registrert et nytt utlegg i Oslo Førerhundklubbs medlemsportal.

Navn: ${name}
Dato: ${expense.expense_date}
Beløp: ${Number(expense.amount || 0).toFixed(2)} kr
Beskrivelse: ${expense.description}

Logg inn i medlemsportalen for å kontrollere registreringen og hente eventuell kvittering.`;

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
                  "post@osloforerhundklubb.no",
                ],

                subject,

                text,

                reply_to:
                  "post@osloforerhundklubb.no",
              }),
          }
        );

      if (
        !response.ok
      ) {
        const responseText =
          await response
            .text()
            .catch(
              () => ""
            );

        console.error(
          "Resend error",
          response.status,
          responseText
        );

        return json(
          {
            error:
              "E-postvarsel kunne ikke sendes.",
          },
          500
        );
      }

      return json(
        {
          success:
            true,

          message:
            "E-postvarsel sendt.",
        }
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      return json(
        {
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