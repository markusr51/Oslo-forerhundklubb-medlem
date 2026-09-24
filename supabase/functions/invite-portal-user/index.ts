import { createClient, servePortal } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const secretKeys = JSON.parse(
  Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
);

const SECRET_KEY = secretKeys.default;

const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  JSON.parse(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"
  ).default ||
  "";

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

        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
      },
    }
  );
}

function safeError(
  error: unknown
) {
  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  try {
    return JSON.stringify(
      error
    );
  } catch {
    return String(
      error
    );
  }
}

servePortal(
  async (
    req
  ) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return json({
        success:
          true,
      });
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

    const requestId =
      crypto.randomUUID();

    console.log(
      `[${requestId}] invite-portal-user startet`
    );

    try {
      if (
        !SECRET_KEY
      ) {
        console.error(
          `[${requestId}] SUPABASE_SECRET_KEYS.default mangler`
        );

        return json(
          {
            success:
              false,

            error:
              "Serveren mangler Supabase secret key.",
          },
          500
        );
      }

      if (
        !ANON_KEY
      ) {
        console.error(
          `[${requestId}] anon/publishable key mangler`
        );

        return json(
          {
            success:
              false,

            error:
              "Serveren mangler Supabase publishable/anon key.",
          },
          500
        );
      }

      const authHeader =
        req.headers.get(
          "Authorization"
        ) ||
        "";

      if (
        !authHeader.startsWith(
          "Bearer "
        )
      ) {
        console.error(
          `[${requestId}] Authorization-header mangler`
        );

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

      const callerClient =
        createClient(
          SUPABASE_URL,
          ANON_KEY,
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
          user:
            caller,
        },

        error:
          callerAuthError,
      } =
        await callerClient
          .auth
          .getUser();

      if (
        callerAuthError ||
        !caller
      ) {
        console.error(
          `[${requestId}] caller auth feilet`,
          callerAuthError
        );

        return json(
          {
            success:
              false,

            error:
              "Kunne ikke bekrefte innloggingen.",
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

      const {
        data:
          callerRow,

        error:
          callerRowError,
      } =
        await admin
          .from(
            "app_users"
          )
          .select(
            "app_role,active,person_id"
          )
          .eq(
            "user_id",
            caller.id
          )
          .maybeSingle();

      if (
        callerRowError
      ) {
        console.error(
          `[${requestId}] app_users lookup feilet`,
          callerRowError
        );

        return json(
          {
            success:
              false,

            error:
              "Kunne ikke kontrollere administratorrollen.",
          },
          500
        );
      }

      if (
        !callerRow ||
        callerRow.active !==
          true ||
        callerRow.app_role !==
          "system_admin"
      ) {
        console.error(
          `[${requestId}] caller er ikke system_admin`,
          {
            callerId:
              caller.id,

            role:
              callerRow
                ?.app_role,

            active:
              callerRow
                ?.active,
          }
        );

        return json(
          {
            success:
              false,

            error:
              "Bare systemadministrator kan invitere portalbrukere.",
          },
          403
        );
      }

      const body =
        await req.json();

      const personId =
        String(
          body.personId ||
          ""
        ).trim();

      const appRole =
        String(
          body.appRole ||
          "readonly"
        ).trim();

      const redirectTo =
        String(
          body.redirectTo ||
          ""
        ).trim();

      console.log(
        `[${requestId}] forespørsel mottatt`,
        {
          personId,

          appRole,

          hasRedirectTo:
            Boolean(
              redirectTo
            ),
        }
      );

      if (
        !personId
      ) {
        return json(
          {
            success:
              false,

            error:
              "personId mangler.",
          },
          400
        );
      }

      if (
        ![
          "readonly",
          "admin",
          "system_admin",
        ].includes(
          appRole
        )
      ) {
        return json(
          {
            success:
              false,

            error:
              "Ugyldig portalrolle.",
          },
          400
        );
      }

      const {
        data:
          person,

        error:
          personError,
      } =
        await admin
          .from(
            "persons"
          )
          .select(
            "id,full_name,email,membership_status"
          )
          .eq(
            "id",
            personId
          )
          .maybeSingle();

      if (
        personError
      ) {
        console.error(
          `[${requestId}] persons lookup feilet`,
          personError
        );

        return json(
          {
            success:
              false,

            error:
              "Kunne ikke hente personen: " +
              personError.message,
          },
          500
        );
      }

      if (
        !person
      ) {
        console.error(
          `[${requestId}] person finnes ikke`,
          {
            personId,
          }
        );

        return json(
          {
            success:
              false,

            error:
              "Personen finnes ikke.",
          },
          404
        );
      }

      const email =
        String(
          person.email ||
          ""
        )
          .trim()
          .toLowerCase();

      console.log(
        `[${requestId}] fant person`,
        {
          personId:
            person.id,

          name:
            person.full_name,

          email,

          membershipStatus:
            person
              .membership_status,
        }
      );

      if (
        !email
      ) {
        return json(
          {
            success:
              false,

            error:
              "Personen mangler registrert e-postadresse.",
          },
          400
        );
      }

      const {
        data:
          existingPersonLink,

        error:
          linkError,
      } =
        await admin
          .from(
            "app_users"
          )
          .select(
            "user_id,active,app_role"
          )
          .eq(
            "person_id",
            person.id
          )
          .maybeSingle();

      if (
        linkError
      ) {
        console.error(
          `[${requestId}] person_id lookup feilet`,
          linkError
        );

        return json(
          {
            success:
              false,

            error:
              "Kunne ikke kontrollere eksisterende portalbruker.",
          },
          500
        );
      }

      if (
        existingPersonLink
      ) {
        console.error(
          `[${requestId}] person har allerede app_users`,
          existingPersonLink
        );

        return json(
          {
            success:
              false,

            error:
              "Personen har allerede en portalbruker.",
          },
          409
        );
      }

      console.log(
        `[${requestId}] forsøker Supabase Auth inviteUserByEmail`,
        {
          email,

          redirectTo:
            redirectTo ||
            null,
        }
      );

      const {
        data:
          invite,

        error:
          inviteError,
      } =
        await admin
          .auth
          .admin
          .inviteUserByEmail(
            email,
            {
              redirectTo:
                redirectTo ||
                undefined,

              data: {
                display_name:
                  person.full_name,

                person_id:
                  person.id,
              },
            }
          );

      if (
        inviteError
      ) {
        console.error(
          `[${requestId}] Auth-invitasjon feilet`,
          {
            message:
              inviteError.message,

            status:
              (
                inviteError as
                  any
              ).status,

            code:
              (
                inviteError as
                  any
              ).code,

            name:
              inviteError.name,
          }
        );

        return json(
          {
            success:
              false,

            error:
              "Supabase Auth avviste invitasjonen: " +
              inviteError.message,

            requestId,
          },
          400
        );
      }

      const invitedUser =
        invite.user;

      if (
        !invitedUser
          ?.id
      ) {
        console.error(
          `[${requestId}] inviteUserByEmail ga ingen user id`,
          invite
        );

        return json(
          {
            success:
              false,

            error:
              "Supabase Auth returnerte ingen bruker-ID.",

            requestId,
          },
          500
        );
      }

      console.log(
        `[${requestId}] Auth-bruker opprettet`,
        {
          userId:
            invitedUser.id,

          email:
            invitedUser.email,

          personId:
            person.id,
        }
      );

      const {
        error:
          upsertError,
      } =
        await admin
          .from(
            "app_users"
          )
          .upsert(
            {
              user_id:
                invitedUser.id,

              display_name:
                person.full_name,

              app_role:
                appRole,

              active:
                true,

              person_id:
                person.id,

              must_change_password:
                true,

              first_login_completed_at:
                null,
            },
            {
              onConflict:
                "user_id",
            }
          );

      if (
        upsertError
      ) {
        console.error(
          `[${requestId}] app_users upsert feilet`,
          upsertError
        );

        const {
          error:
            cleanupError,
        } =
          await admin
            .auth
            .admin
            .deleteUser(
              invitedUser.id
            );

        if (
          cleanupError
        ) {
          console.error(
            `[${requestId}] cleanup av Auth-bruker feilet`,
            cleanupError
          );
        } else {
          console.log(
            `[${requestId}] halvopprettet Auth-bruker ble ryddet bort`
          );
        }

        return json(
          {
            success:
              false,

            error:
              "Auth-brukeren ble opprettet, men koblingen til personregisteret feilet: " +
              upsertError.message,

            requestId,
          },
          500
        );
      }

      console.log(
        `[${requestId}] app_users koblet til person_id`,
        {
          userId:
            invitedUser.id,

          personId:
            person.id,

          appRole,
        }
      );

      const {
        data:
          verify,

        error:
          verifyError,
      } =
        await admin
          .from(
            "app_users"
          )
          .select(
            "user_id,person_id,app_role,active,must_change_password"
          )
          .eq(
            "user_id",
            invitedUser.id
          )
          .maybeSingle();

      if (
        verifyError ||
        !verify ||
        verify.person_id !==
          person.id
      ) {
        console.error(
          `[${requestId}] verifisering av kobling feilet`,
          {
            verifyError,

            verify,
          }
        );

        return json(
          {
            success:
              false,

            error:
              "Brukeren ble opprettet, men personkoblingen kunne ikke verifiseres.",

            requestId,
          },
          500
        );
      }

      console.log(
        `[${requestId}] invitasjon ferdig`,
        {
          userId:
            invitedUser.id,

          personId:
            verify.person_id,

          email,

          appRole:
            verify.app_role,
        }
      );

      return json({
        success:
          true,

        message:
          `Aktiveringsinvitasjon er opprettet for ${email}.`,

        personId:
          verify.person_id,

        userId:
          verify.user_id,

        requestId,
      });
    } catch (
      error
    ) {
      console.error(
        `[${requestId}] uventet feil`,
        error
      );

      return json(
        {
          success:
            false,

          error:
            "Uventet feil i invite-portal-user: " +
            safeError(
              error
            ),

          requestId,
        },
        500
      );
    }
  }
);