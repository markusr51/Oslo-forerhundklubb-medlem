import { createClient, servePortal } from "../_shared/portal-scope.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || "";

const SECRET_KEYS =
  JSON.parse(
    Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
  );

const PUBLISHABLE_KEYS =
  JSON.parse(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"
  );

const SECRET_KEY =
  SECRET_KEYS.default || "";

const PUBLISHABLE_KEY =
  PUBLISHABLE_KEYS.default ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  "";

const RESEND_API_KEY =
  Deno.env.get("RESEND_API_KEY") || "";

const SVEVE_USER =
  Deno.env.get("SVEVE_USER") || "";

const SVEVE_API_KEY =
  Deno.env.get("SVEVE_API_KEY") || "";

const SVEVE_SENDER_TEXT =
  Deno.env.get("SVEVE_SENDER_TEXT") ||
  "Oslo FHK";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-club",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};


function json(
  body,
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


function normalizePhone(
  value
) {
  let number =
    String(value || "")
      .replace(
        /[^\d+]/g,
        ""
      );

  if (
    number.startsWith(
      "+47"
    )
  ) {
    number =
      number.slice(3);
  }

  if (
    number.startsWith(
      "0047"
    )
  ) {
    number =
      number.slice(4);
  }

  return /^\d{8}$/.test(
    number
  )
    ? number
    : null;
}


async function sendEmail(
  to,
  subject,
  text
) {
  if (
    !RESEND_API_KEY
  ) {
    return false;
  }

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
              "Oslo Førerhundklubb <post@osloforerhundklubb.no>",

            to: [
              to,
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
    console.error(
      "E-postvarsling feilet:",
      await response.text()
    );
  }

  return response.ok;
}


async function sendSms(
  to,
  text
) {
  const phone =
    normalizePhone(
      to
    );

  if (
    !phone ||
    !SVEVE_USER ||
    !SVEVE_API_KEY
  ) {
    return false;
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
          JSON.stringify({
            user:
              SVEVE_USER,

            passwd:
              SVEVE_API_KEY,

            to:
              phone,

            msg:
              text,

            from:
              SVEVE_SENDER_TEXT,

            f:
              "json",

            reply:
              false,
          }),
      }
    );

  if (
    !response.ok
  ) {
    console.error(
      "SMS-varsling feilet:",
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


      const {
        data: {
          user,
        },
      } =
        await userClient
          .auth
          .getUser();


      if (
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


      const {
        data:
          caller,
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
        !caller ||
        caller.active !==
          true
      ) {
        return json(
          {
            success:
              false,

            error:
              "Ingen aktiv portalbruker.",
          },
          403
        );
      }


      const body =
        await req.json();


      const kind =
        String(
          body.kind ||
          ""
        );


      const id =
        String(
          body.id ||
          ""
        );


      if (
        ![
          "entry",
          "expense",
          "general_expense",
        ].includes(
          kind
        ) ||
        !id
      ) {
        return json(
          {
            success:
              false,

            error:
              "Ugyldig type eller ID.",
          },
          400
        );
      }


      let table;
      let fields;


      if (
        kind ===
        "entry"
      ) {

        table =
          "helper_entries";

        fields =
          "id,person_id,activity_date,activity_type,description,kilometers,status,persons(full_name,email,phone)";

      } else if (
        kind ===
        "expense"
      ) {

        table =
          "helper_expenses";

        fields =
          "id,person_id,expense_date,amount,description,status,persons(full_name,email,phone)";

      } else {

        table =
          "general_expenses";

        fields =
          "id,person_id,expense_date,amount,description,status,persons(full_name,email,phone)";
      }


      const {
        data:
          item,

        error:
          itemError,
      } =
        await admin
          .from(
            table
          )
          .select(
            fields
          )
          .eq(
            "id",
            id
          )
          .maybeSingle();


      if (
        itemError ||
        !item
      ) {

        console.error(
          "Kunne ikke hente registreringen:",
          itemError
        );

        return json(
          {
            success:
              false,

            error:
              "Registreringen finnes ikke.",
          },
          404
        );
      }


      const isAdmin =
        [
          "admin",
          "system_admin",
        ].includes(
          caller.app_role
        );


      if (
        !isAdmin &&
        item.person_id !==
          caller.person_id
      ) {
        return json(
          {
            success:
              false,

            error:
              "Ingen tilgang.",
          },
          403
        );
      }


      const personName =
        item.persons
          ?.full_name ||
        "Ukjent person";


      let title;


      if (
        kind ===
        "entry"
      ) {
        title =
          `Nytt hjelpetreneroppdrag: ${personName}`;

      } else if (
        kind ===
        "expense"
      ) {
        title =
          `Nytt hjelpetrenerutlegg: ${personName}`;

      } else {
        title =
          `Nytt utlegg: ${personName}`;
      }


      const detail =
        kind ===
        "entry"

          ? `${item.activity_date}: ${
              item.description ||
              item.activity_type ||
              "Oppdrag"
            }`

          : `${item.expense_date}: ${
              item.description ||
              "Utlegg"
            } – ${Number(
              item.amount ||
              0
            ).toFixed(
              2
            )} kr`;


      const notificationRow =
        {
          notification_type:
            kind ===
            "entry"

              ? "helper_entry"

              : kind ===
                "expense"

                ? "helper_expense"

                : "general_expense",

          title,

          message:
            detail,

          related_person_id:
            item.person_id,
        };


      if (
        kind ===
        "expense"
      ) {
        notificationRow
          .related_expense_id =
          item.id;
      }


      if (
        kind ===
        "general_expense"
      ) {
        notificationRow
          .related_general_expense_id =
          item.id;
      }


      const {
        error:
          notificationError,
      } =
        await admin
          .from(
            "admin_notifications"
          )
          .insert(
            notificationRow
          );


      if (
        notificationError
      ) {
        console.error(
          "Kunne ikke opprette administratorvarsel:",
          notificationError
        );
      }


      /*
       * Finn aktiv gruppe med navnet Styret.
       */

      const {
        data:
          boardGroups,

        error:
          boardGroupError,
      } =
        await admin
          .from(
            "groups"
          )
          .select(
            "id"
          )
          .ilike(
            "name",
            "Styret"
          )
          .eq(
            "active",
            true
          );


      if (
        boardGroupError
      ) {
        console.error(
          "Kunne ikke finne Styret-gruppen:",
          boardGroupError
        );
      }


      const groupIds =
        (
          boardGroups ||
          []
        ).map(
          (
            group
          ) =>
            group.id
        );


      let recipients =
        [];


      if (
        groupIds.length >
        0
      ) {

        const {
          data:
            members,

          error:
            membersError,
        } =
          await admin
            .from(
              "group_members"
            )
            .select(
              "function_name,persons(full_name,email,phone)"
            )
            .in(
              "group_id",
              groupIds
            );


        if (
          membersError
        ) {
          console.error(
            "Kunne ikke hente varslingsmottakere:",
            membersError
          );

        } else {

          recipients =
            (
              members ||
              []
            )
              .filter(
                (
                  member
                ) => {

                  const functionName =
                    String(
                      member
                        .function_name ||
                      ""
                    )
                      .trim()
                      .toLowerCase();


                  return [
                    "styreleder",
                    "nestleder",
                  ].includes(
                    functionName
                  );
                }
              )

              .map(
                (
                  member
                ) =>
                  member
                    .persons
              )

              .filter(
                Boolean
              );
        }
      }


      /*
       * Fellespost mottar alltid e-post.
       */

      const emailTargets =
        new Set(
          [
            "post@osloforerhundklubb.no",
          ]
        );


      const smsTargets =
        new Set();


      for (
        const recipient
        of recipients
      ) {

        if (
          recipient.email
        ) {
          emailTargets.add(
            String(
              recipient.email
            )
              .trim()
              .toLowerCase()
          );
        }


        const phone =
          normalizePhone(
            recipient.phone
          );


        if (
          phone
        ) {
          smsTargets.add(
            phone
          );
        }
      }


      let emailSubject;


      if (
        kind ===
        "entry"
      ) {

        emailSubject =
          "Nytt hjelpetreneroppdrag til godkjenning";

      } else if (
        kind ===
        "expense"
      ) {

        emailSubject =
          "Nytt hjelpetrenerutlegg til behandling";

      } else {

        emailSubject =
          "Nytt utlegg til behandling";
      }


      const emailText =
`Hei!

${title}

${detail}

Logg inn i medlemsportalen for å behandle registreringen.

Med vennlig hilsen
Oslo Førerhundklubb`;


      const smsText =
        kind ===
        "entry"

          ? `Oslo FHK: ${personName} har registrert et hjelpetreneroppdrag som venter på godkjenning.`

          : `Oslo FHK: ${personName} har registrert et utlegg som venter på behandling.`;


      let emailSent =
        0;

      let smsSent =
        0;


      for (
        const emailAddress
        of emailTargets
      ) {

        if (
          await sendEmail(
            emailAddress,
            emailSubject,
            emailText
          )
        ) {
          emailSent +=
            1;
        }
      }


      for (
        const phoneNumber
        of smsTargets
      ) {

        if (
          await sendSms(
            phoneNumber,
            smsText
          )
        ) {
          smsSent +=
            1;
        }
      }


      return json({
        success:
          true,

        notificationCreated:
          !notificationError,

        emailSent,

        smsSent,
      });

    } catch (
      error
    ) {

      console.error(
        "notify-helper-activity:",
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