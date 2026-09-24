import { createClient, servePortal } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SECRET_KEY = SECRET_KEYS.default || "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

const SVEVE_USER = Deno.env.get("SVEVE_USER") || "";
const SVEVE_API_KEY = Deno.env.get("SVEVE_API_KEY") || "";
const SVEVE_SENDER_TEXT =
  Deno.env.get("SVEVE_SENDER_TEXT") || "Oslo FHK";

const FROM_ADDRESS =
  "Oslo Førerhundklubb <post@osloforerhundklubb.no>";

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

function normalizePhone(value: unknown) {
  let phone = String(value || "")
    .replace(/[^\d+]/g, "");

  if (phone.startsWith("+47")) {
    phone = phone.slice(3);
  }

  if (phone.startsWith("0047")) {
    phone = phone.slice(4);
  }

  return /^\d{8}$/.test(phone)
    ? phone
    : null;
}

async function sendSms(to: unknown, text: string) {
  const phone = normalizePhone(to);

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
        method: "POST",

        headers: {
          "Content-Type":
            "application/json; charset=utf-8",
        },

        body: JSON.stringify({
          user: SVEVE_USER,
          passwd: SVEVE_API_KEY,
          to: phone,
          msg: text,
          from: SVEVE_SENDER_TEXT,
          f: "json",
          reply: false,
        }),
      }
    );

  return response.ok;
}

async function sendEmail(
  to: unknown,
  subject: string,
  text: string
) {
  if (
    !to ||
    !RESEND_API_KEY
  ) {
    return false;
  }

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [String(to)],
          subject,
          text,
        }),
      }
    );

  return response.ok;
}

async function getContext(
  req: Request
) {
  const authHeader =
    req.headers.get("Authorization") || "";

  if (
    !authHeader.startsWith("Bearer ")
  ) {
    throw new Error(
      "AUTH:Ikke innlogget."
    );
  }

  const admin =
    createClient(
      SUPABASE_URL,
      SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

  const token =
    authHeader.slice(7);

  const {
    data: {
      user,
    },
    error: userError,
  } =
    await admin.auth.getUser(token);

  if (
    userError ||
    !user
  ) {
    throw new Error(
      "AUTH:Ugyldig innlogging."
    );
  }

  const {
    data: appUser,
    error: appUserError,
  } =
    await admin
      .from("app_users")
      .select(
        "person_id,app_role,active"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (
    appUserError ||
    !appUser ||
    appUser.active !== true ||
    !appUser.person_id
  ) {
    throw new Error(
      "AUTH:Ingen aktiv personkobling."
    );
  }

  const {
    data: helperRoles,
  } =
    await admin
      .from("person_roles")
      .select(
        "roles(name)"
      )
      .eq(
        "person_id",
        appUser.person_id
      )
      .eq(
        "is_active",
        true
      );

  const {data:helperMemberships,error:helperMembershipError}=await admin.from("portal_club_memberships").select("person_id").eq("person_id",appUser.person_id).eq("role","helper").eq("active",true);
  if(helperMembershipError)throw helperMembershipError;
  const isHelper = !!helperMemberships?.length &&
    (helperRoles || [])
      .some(
        row =>
          String(
            row.roles?.name || ""
          )
            .trim()
            .toLowerCase() ===
          "hjelpetrener"
      );

  const isAdmin =
    appUser.app_role === "admin" ||
    appUser.app_role === "system_admin";

  return {
    admin,
    user,
    appUser,
    isHelper,
    isAdmin,
  };
}

async function getPerson(
  admin: any,
  personId: string
) {
  const {
    data,
    error,
  } =
    await admin
      .from("portal_service_contacts")
      .select(
        "id,full_name,email,phone"
      )
      .eq(
        "id",
        personId
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function listUserRequests(
  admin: any,
  personId: string
) {
  const {
    data,
    error,
  } =
    await admin
      .from("helper_requests")
      .select("*")
      .eq(
        "requester_person_id",
        personId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw error;
  }

  const rows = [];

  for (
    const request of
    data || []
  ) {
    let helperName = null;

    if (
      request.assigned_helper_person_id
    ) {
      const helper =
        await getPerson(
          admin,
          request.assigned_helper_person_id
        );

      helperName =
        helper?.full_name || null;
    }

    rows.push({
      ...request,
      assigned_helper_name:
        helperName,
    });
  }

  return rows;
}

async function listOpenRequests(
  admin: any
) {
  const {
    data,
    error,
  } =
    await admin
      .from("helper_requests")
      .select("*")
      .eq(
        "status",
        "open"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  const rows = [];

  for (
    const request of
    data || []
  ) {
    const requester =
      await getPerson(
        admin,
        request.requester_person_id
      );

    rows.push({
      id: request.id,
      help_type:
        request.help_type,
      location_text:
        request.location_text,
      timing_type:
        request.timing_type,
      requested_date:
        request.requested_date,
      requested_time:
        request.requested_time,
      comment:
        request.comment,
      created_at:
        request.created_at,

      requester_name:
        requester?.full_name || null,

      // Telefonnummer deles aldri
      // før forespørselen er tildelt.
      requester_phone: null,
    });
  }

  return rows;
}

async function listMyHelperRequests(
  admin: any,
  helperPersonId: string
) {
  const {
    data,
    error,
  } =
    await admin
      .from("helper_requests")
      .select("*")
      .eq(
        "assigned_helper_person_id",
        helperPersonId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw error;
  }

  const rows = [];

  for (
    const request of
    data || []
  ) {
    const requester =
      await getPerson(
        admin,
        request.requester_person_id
      );

    rows.push({
      ...request,

      requester_name:
        requester?.full_name || null,

      requester_phone:
        request.share_phone
          ? requester?.phone || null
          : null,
    });
  }

  return rows;
}

async function notifyHelpers(
  admin: any,
  request: any
) {
  const {
    data: role,
  } =
    await admin
      .from("roles")
      .select("id")
      .ilike(
        "name",
        "Hjelpetrener"
      )
      .maybeSingle();

  if (!role) {
    return;
  }

  const {
    data: assignments,
  } =
    await admin
      .from("person_roles")
      .select("person_id")
      .eq(
        "role_id",
        role.id
      )
      .eq(
        "is_active",
        true
      );

  const ids =
    [
      ...new Set(
        (assignments || [])
          .map(
            row =>
              row.person_id
          )
      ),
    ];

  const {data:workingHelpers,error:workingError}=await admin.from("portal_club_memberships").select("person_id").eq("role","helper").eq("active",true);
  if(workingError)throw workingError;
  for(let i=ids.length-1;i>=0;i--)if(!workingHelpers?.some((m:any)=>m.person_id===ids[i]))ids.splice(i,1);

  if (!ids.length) {
    return;
  }

  const {
    data: helpers,
  } =
    await admin
      .from("portal_service_contacts")
      .select(
        "id,full_name,email,phone"
      )
      .in(
        "id",
        ids
      );

  const when =
    request.timing_type === "asap"
      ? "så snart som mulig"
      : `${request.requested_date || ""}${
          request.requested_time
            ? " kl. " +
              String(
                request.requested_time
              ).slice(0, 5)
            : ""
        }`;

  const text =
    `Ny hjelpetrenerforespørsel: ` +
    `${request.help_type}. ` +
    `Sted: ${request.location_text}. ` +
    `Tid: ${when}. ` +
    `Åpne medlemsportalen for detaljer og for å ta oppdraget.`;

  for (
    const helper of
    helpers || []
  ) {
    await sendSms(
      helper.phone,
      text
    );

    await sendEmail(
      helper.email,
      "Ny hjelpetrenerforespørsel – Oslo FHK",
      text
    );
  }
}

async function notifyClaimed(
  admin: any,
  request: any
) {
  const requester =
    await getPerson(
      admin,
      request.requester_person_id
    );

  const helper =
    await getPerson(
      admin,
      request.assigned_helper_person_id
    );

  const requesterText =
    `${helper?.full_name || "En hjelpetrener"} ` +
    `har tatt forespørselen din om ${request.help_type}. ` +
    `Du kan se status i medlemsportalen.`;

  await sendSms(
    requester?.phone,
    requesterText
  );

  await sendEmail(
    requester?.email,
    "Hjelpetrener har tatt forespørselen din",
    requesterText
  );

  const helperText =
    request.share_phone &&
    requester?.phone
      ? `Du har fått oppdraget ${request.help_type}. ` +
        `Bruker har samtykket til deling av mobilnummer: ` +
        `${requester.phone}.`
      : `Du har fått oppdraget ${request.help_type}. ` +
        `Bruker har ikke samtykket til deling av mobilnummer.`;

  await sendSms(
    helper?.phone,
    helperText
  );

  await sendEmail(
    helper?.email,
    "Du har fått et hjelpetreneroppdrag",
    helperText
  );
}

servePortal(
  async req => {

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
          success: false,
          error:
            "Kun POST er tillatt.",
        },
        405
      );
    }

    try {
      const ctx =
        await getContext(req);

      const body =
        await req
          .json()
          .catch(
            () => ({})
          );

      const action =
        String(
          body.action || ""
        );

      if (
        action ===
        "create"
      ) {
        const helpType =
          String(
            body.helpType || ""
          ).trim();

        const locationText =
          String(
            body.locationText || ""
          ).trim();

        const timingType =
          body.timingType === "date"
            ? "date"
            : "asap";

        const requestedDate =
          timingType === "date"
            ? String(
                body.requestedDate || ""
              )
            : null;

        const requestedTime =
          timingType === "date" &&
          body.requestedTime
            ? String(
                body.requestedTime
              )
            : null;

        const comment =
          String(
            body.comment || ""
          ).trim() || null;

        const sharePhone =
          body.sharePhone === true;

        if (
          !helpType ||
          !locationText
        ) {
          return json(
            {
              success: false,
              error:
                "Hva du ønsker hjelp med og sted må fylles ut.",
            },
            400
          );
        }

        if (
          timingType === "date" &&
          !requestedDate
        ) {
          return json(
            {
              success: false,
              error:
                "Velg dato.",
            },
            400
          );
        }

        const {
          data: request,
          error,
        } =
          await ctx.admin
            .from(
              "helper_requests"
            )
            .insert({
              requester_person_id:
                ctx.appUser.person_id,

              help_type:
                helpType,

              location_text:
                locationText,

              timing_type:
                timingType,

              requested_date:
                requestedDate,

              requested_time:
                requestedTime,

              comment,

              share_phone:
                sharePhone,
            })
            .select("*")
            .single();

        if (error) {
          throw error;
        }

        await notifyHelpers(
          ctx.admin,
          request
        );

        return json({
          success: true,
          request,
        });
      }

      if (
        action ===
        "list_user"
      ) {
        return json({
          success: true,

          requests:
            await listUserRequests(
              ctx.admin,
              ctx.appUser.person_id
            ),
        });
      }

      if (
        action ===
        "cancel"
      ) {
        const requestId =
          String(
            body.requestId || ""
          );

        const {
          data: existing,
        } =
          await ctx.admin
            .from(
              "helper_requests"
            )
            .select("*")
            .eq(
              "id",
              requestId
            )
            .maybeSingle();

        if (!existing) {
          return json(
            {
              success: false,
              error:
                "Forespørselen finnes ikke.",
            },
            404
          );
        }

        if (
          existing.requester_person_id !==
            ctx.appUser.person_id &&
          !ctx.isAdmin
        ) {
          return json(
            {
              success: false,
              error:
                "Ingen tilgang.",
            },
            403
          );
        }

        if (
          ![
            "open",
            "assigned",
            "agreed",
          ].includes(
            existing.status
          )
        ) {
          return json(
            {
              success: false,
              error:
                "Forespørselen kan ikke avlyses i denne statusen.",
            },
            409
          );
        }

        const {
          error,
        } =
          await ctx.admin
            .from(
              "helper_requests"
            )
            .update({
              status:
                "cancelled",

              cancelled_at:
                new Date()
                  .toISOString(),

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              "id",
              requestId
            );

        if (error) {
          throw error;
        }

        return json({
          success: true,
        });
      }

      if (
        action ===
        "list_helper"
      ) {
        if (
          !ctx.isHelper &&
          !ctx.isAdmin
        ) {
          return json(
            {
              success: false,
              error:
                "Bare hjelpetrenere og administratorer har tilgang.",
            },
            403
          );
        }

        return json({
          success: true,

          canClaim:
            ctx.isHelper,

          open:
            await listOpenRequests(
              ctx.admin
            ),

          mine:
            await listMyHelperRequests(
              ctx.admin,
              ctx.appUser.person_id
            ),
        });
      }

      if (
        action ===
        "claim"
      ) {
        if (!ctx.isHelper) {
          return json(
            {
              success: false,
              error:
                "Bare aktive hjelpetrenere kan ta oppdrag.",
            },
            403
          );
        }

        const requestId =
          String(
            body.requestId || ""
          );

        // Atomisk claim:
        // bare første update på en åpen,
        // utildelt rad får resultat.
        const {
          data: claimedRows,
          error,
        } =
          await ctx.admin
            .from(
              "helper_requests"
            )
            .update({
              assigned_helper_person_id:
                ctx.appUser.person_id,

              status:
                "assigned",

              assigned_at:
                new Date()
                  .toISOString(),

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              "id",
              requestId
            )
            .eq(
              "status",
              "open"
            )
            .is(
              "assigned_helper_person_id",
              null
            )
            .select("*");

        if (error) {
          throw error;
        }

        if (
          !claimedRows ||
          claimedRows.length !== 1
        ) {
          return json(
            {
              success: false,
              error:
                "Oppdraget er allerede tatt eller ikke lenger tilgjengelig.",
            },
            409
          );
        }

        const request =
          claimedRows[0];

        await notifyClaimed(
          ctx.admin,
          request
        );

        return json({
          success: true,

          request:
            (
              await listMyHelperRequests(
                ctx.admin,
                ctx.appUser.person_id
              )
            )
              .find(
                row =>
                  row.id ===
                  request.id
              ) ||
            request,
        });
      }

      if (
        action ===
        "set_status"
      ) {
        const requestId =
          String(
            body.requestId || ""
          );

        const newStatus =
          String(
            body.status || ""
          );

        const agreedDate =
          body.agreedDate
            ? String(body.agreedDate)
            : null;

        const agreedTime =
          body.agreedTime
            ? String(body.agreedTime)
            : null;

        if (
          ![
            "agreed",
            "completed",
            "cancelled",
          ].includes(
            newStatus
          )
        ) {
          return json(
            {
              success: false,
              error:
                "Ugyldig status.",
            },
            400
          );
        }

        if (
          newStatus === "agreed" &&
          !agreedDate
        ) {
          return json(
            {
              success: false,
              error:
                "Avtalt dato må fylles ut.",
            },
            400
          );
        }

        const {
          data: existing,
        } =
          await ctx.admin
            .from(
              "helper_requests"
            )
            .select("*")
            .eq(
              "id",
              requestId
            )
            .maybeSingle();

        if (!existing) {
          return json(
            {
              success: false,
              error:
                "Forespørselen finnes ikke.",
            },
            404
          );
        }

        const allowed =
          existing.requester_person_id ===
            ctx.appUser.person_id ||
          existing.assigned_helper_person_id ===
            ctx.appUser.person_id ||
          ctx.isAdmin;

        if (!allowed) {
          return json(
            {
              success: false,
              error:
                "Ingen tilgang.",
            },
            403
          );
        }

        const patch: any = {
          status:
            newStatus,

          updated_at:
            new Date()
              .toISOString(),
        };

        if (
          newStatus ===
          "agreed"
        ) {
          patch.agreed_date =
            agreedDate;

          patch.agreed_time =
            agreedTime;
        }

        if (
          newStatus ===
          "completed"
        ) {
          patch.completed_at =
            new Date()
              .toISOString();
        }

        if (
          newStatus ===
          "cancelled"
        ) {
          patch.cancelled_at =
            new Date()
              .toISOString();
        }

        const {
          error,
        } =
          await ctx.admin
            .from(
              "helper_requests"
            )
            .update(patch)
            .eq(
              "id",
              requestId
            );

        if (error) {
          throw error;
        }

        return json({
          success: true,
        });
      }


      if (
        action ===
        "board_overview"
      ) {
        if (!ctx.isAdmin) {
          return json(
            {
              success: false,
              error:
                "Ingen tilgang.",
            },
            403
          );
        }

        // Tilgang snevres ytterligere inn i frontend til styreleder/nestleder.
        const {
          data: openRows,
          error: openError,
        } =
          await ctx.admin
            .from("helper_requests")
            .select("*")
            .eq("status","open")
            .order("created_at",{ascending:true});

        if (openError) {
          throw openError;
        }

        const {
          data: agreedRows,
          error: agreedError,
        } =
          await ctx.admin
            .from("helper_requests")
            .select("*")
            .eq("status","agreed")
            .not("agreed_date","is",null)
            .order("agreed_date",{ascending:true})
            .order("agreed_time",{ascending:true});

        if (agreedError) {
          throw agreedError;
        }

        async function enrich(rows:any[]) {
          const out:any[] = [];

          for (const row of rows || []) {
            const requester =
              await getPerson(
                ctx.admin,
                row.requester_person_id
              );

            const helper =
              row.assigned_helper_person_id
                ? await getPerson(
                    ctx.admin,
                    row.assigned_helper_person_id
                  )
                : null;

            out.push({
              ...row,
              requester_name:
                requester?.full_name || null,
              helper_name:
                helper?.full_name || null,
            });
          }

          return out;
        }

        return json({
          success:true,
          open:
            await enrich(openRows || []),
          agreed:
            await enrich(agreedRows || []),
        });
      }

      return json(
        {
          success: false,
          error:
            "Ukjent handling.",
        },
        400
      );

    } catch (
      error
    ) {
      console.error(
        "helper-requests:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const auth =
        message.startsWith(
          "AUTH:"
        );

      return json(
        {
          success: false,

          error:
            auth
              ? message.slice(5)
              : message,
        },
        auth
          ? 401
          : 500
      );
    }
  }
);
