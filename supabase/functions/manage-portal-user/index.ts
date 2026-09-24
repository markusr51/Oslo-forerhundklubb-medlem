import { createClient, servePortal } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const publishableKeys = JSON.parse(
  Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"
);

const secretKeys = JSON.parse(
  Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
);

const PUBLISHABLE_KEY = publishableKeys.default;
const SECRET_KEY = secretKeys.default;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

servePortal(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Kun POST er tillatt." },
      405
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json(
        { error: "Ikke innlogget." },
        401
      );
    }

    const userClient = createClient(
      SUPABASE_URL,
      PUBLISHABLE_KEY,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
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
      data: { user: callerUser },
      error: callerUserError,
    } = await userClient.auth.getUser();

    if (callerUserError || !callerUser) {
      return json(
        { error: "Ugyldig innlogging." },
        401
      );
    }

    const {
      data: callerProfile,
      error: callerProfileError,
    } = await adminClient
      .from("app_users")
      .select("app_role, active")
      .eq("user_id", callerUser.id)
      .single();

    if (
      callerProfileError ||
      !callerProfile ||
      callerProfile.active !== true ||
      callerProfile.app_role !== "system_admin"
    ) {
      return json(
        {
          error:
            "Bare systemadministrator kan administrere portalbrukere.",
        },
        403
      );
    }

    const body = await req.json();

    const targetUserId =
      String(body.userId || "").trim();

    const action =
      String(body.action || "").trim();

    const allowedActions = [
      "deactivate",
      "reactivate",
      "change_role",
      "delete",
    ];

    if (!targetUserId) {
      return json(
        { error: "Bruker-ID mangler." },
        400
      );
    }

    if (!allowedActions.includes(action)) {
      return json(
        { error: "Ugyldig handling." },
        400
      );
    }

    const {
      data: targetProfile,
      error: targetProfileError,
    } = await adminClient
      .from("app_users")
      .select(
        "user_id, display_name, app_role, active"
      )
      .eq("user_id", targetUserId)
      .single();

    if (
      targetProfileError ||
      !targetProfile
    ) {
      return json(
        { error: "Portalbrukeren finnes ikke." },
        404
      );
    }


    // DEAKTIVER
    if (action === "deactivate") {
      const {
        error: deactivateError,
      } = await adminClient
        .from("app_users")
        .update({
          active: false,
        })
        .eq("user_id", targetUserId);

      if (deactivateError) {
        return json(
          {
            error: deactivateError.message,
          },
          400
        );
      }

      const {
        error: banError,
      } =
        await adminClient.auth.admin.updateUserById(
          targetUserId,
          {
            // 100 år. Portalen bruker i tillegg
            // app_users.active for umiddelbar tilgangssperre.
            ban_duration: "876000h",
          }
        );

      if (banError) {
        // Reverser app_users dersom Auth-ban feiler.
        await adminClient
          .from("app_users")
          .update({
            active: true,
          })
          .eq("user_id", targetUserId);

        return json(
          {
            error:
              "Brukeren kunne ikke deaktiveres i Auth: " +
              banError.message,
          },
          500
        );
      }

      return json({
        success: true,
        action: "deactivate",
        message: "Portalbrukeren er deaktivert.",
      });
    }


    // REAKTIVER
    if (action === "reactivate") {
      const {
        error: unbanError,
      } =
        await adminClient.auth.admin.updateUserById(
          targetUserId,
          {
            ban_duration: "none",
          }
        );

      if (unbanError) {
        return json(
          {
            error:
              "Brukeren kunne ikke reaktiveres i Auth: " +
              unbanError.message,
          },
          500
        );
      }

      const {
        error: activateError,
      } = await adminClient
        .from("app_users")
        .update({
          active: true,
        })
        .eq("user_id", targetUserId);

      if (activateError) {
        // Forsøk å sperre igjen hvis databasen ikke kunne oppdateres.
        await adminClient.auth.admin.updateUserById(
          targetUserId,
          {
            ban_duration: "876000h",
          }
        );

        return json(
          {
            error:
              "Tilgangsprofilen kunne ikke aktiveres: " +
              activateError.message,
          },
          500
        );
      }

      return json({
        success: true,
        action: "reactivate",
        message: "Portalbrukeren er reaktivert.",
      });
    }


    // ENDRE ROLLE
    if (action === "change_role") {
      const newRole =
        String(body.appRole || "").trim();

      const allowedRoles = [
        "system_admin",
        "admin",
        "readonly",
      ];

      if (!allowedRoles.includes(newRole)) {
        return json(
          { error: "Ugyldig tilgangsrolle." },
          400
        );
      }

      const {
        error: roleError,
      } = await adminClient
        .from("app_users")
        .update({
          app_role: newRole,
        })
        .eq("user_id", targetUserId);

      if (roleError) {
        return json(
          {
            error: roleError.message,
          },
          400
        );
      }

      return json({
        success: true,
        action: "change_role",
        appRole: newRole,
        message: "Tilgangsrollen er endret.",
      });
    }


    // SLETT
    if (action === "delete") {
      if (targetUserId === callerUser.id) {
        return json(
          {
            error:
              "Du kan ikke slette din egen konto mens du er innlogget.",
          },
          400
        );
      }

      /*
       * app_users har FK mot auth.users med ON DELETE CASCADE.
       *
       * Når Auth-brukeren slettes, slettes derfor
       * app_users-posten automatisk.
       *
       * protect_last_system_admin-triggeren vår
       * vil stoppe sletting dersom dette er siste
       * aktive systemadministrator.
       */
      const {
        error: deleteError,
      } =
        await adminClient.auth.admin.deleteUser(
          targetUserId,
          false
        );

      if (deleteError) {
        return json(
          {
            error:
              "Portalbrukeren kunne ikke slettes: " +
              deleteError.message,
          },
          400
        );
      }

      return json({
        success: true,
        action: "delete",
        message:
          "Portalbrukeren er permanent slettet.",
      });
    }

    return json(
      { error: "Ukjent handling." },
      400
    );
  } catch (error) {
    console.error(error);

    return json(
      {
        error: "En intern feil oppstod.",
      },
      500
    );
  }
});