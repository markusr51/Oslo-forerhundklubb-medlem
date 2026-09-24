import { createClubClient } from "../_shared/portal-scope.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:svix";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SECRET_KEY = SECRET_KEYS.default || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
const SVEVE_USER = Deno.env.get("SVEVE_USER") || "";
const SVEVE_API_KEY = Deno.env.get("SVEVE_API_KEY") || "";
const SVEVE_SENDER_TEXT = Deno.env.get("SVEVE_SENDER_TEXT") || "Oslo FHK";
const INBOUND_DOMAIN = "anteapeut.resend.app";
const FROM_ADDRESS = "Oslo Førerhundklubb <post@osloforerhundklubb.no>";
const CLUB_EMAIL = "post@osloforerhundklubb.no";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
function extractEmail(value) {
  const text = String(value || "").trim();
  const angle = text.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (angle?.[1]) {
    return angle[1].trim().toLowerCase();
  }
  const plain = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain?.[0]?.trim().toLowerCase() || "";
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function extractReplyToken(recipients) {
  if (!Array.isArray(recipients)) {
    return null;
  }
  for (const recipient of recipients) {
    /*
     * VIKTIG:
     * Tokenet er case-sensitive.
     * Vi må derfor IKKE bruke extractEmail() her,
     * fordi den funksjonen lowercaser hele adressen.
     *
     * Domenet kan sammenlignes case-insensitivt,
     * men lokal-delen (arr-TOKEN) må beholdes nøyaktig.
     */
    const raw = String(recipient || "").trim();
    const angleMatch =
      raw.match(/<([^<>@\s]+@[^<>@\s]+)>/);
    const plainMatch =
      raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email =
      angleMatch?.[1] ||
      plainMatch?.[0] ||
      "";
    const atIndex = email.lastIndexOf("@");
    if (atIndex <= 0) {
      continue;
    }
    const local =
      email.slice(0, atIndex);
    const domain =
      email.slice(atIndex + 1).toLowerCase();
    if (domain !== INBOUND_DOMAIN) {
      continue;
    }
    if (!local.startsWith("arr-")) {
      continue;
    }
    const token =
      local.slice(4);
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
      continue;
    }
    return token;
  }
  return null;
}
function extractOwnReply(text) {
  const result = [];
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith(">")) {
      break;
    }
    if (/^on .+wrote:?$/i.test(line)) {
      break;
    }
    if (/^den .+skrev:?$/i.test(line)) {
      break;
    }
    if (/^(fra|from):/i.test(line)) {
      break;
    }
    if (/^--\s*$/.test(line)) {
      break;
    }
    if (line) {
      result.push(line);
    }
    if (result.join(" ").length > 1000) {
      break;
    }
  }
  return result
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
function interpretReply(text) {
  const ownReply = extractOwnReply(text);
  const normalized = ownReply
    .toLowerCase()
    .replace(/[.,!?;:()[\]"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  console.log("DEBUG: tekst som tolkes:", normalized);
  if (!normalized) {
    return null;
  }
  // Viktig: NEI testes før JA.
  const negativePatterns = [
    /\bnei\b/,
    /\bnei takk\b/,
    /\bjeg kommer ikke\b/,
    /\bvi kommer ikke\b/,
    /\bkan ikke komme\b/,
    /\bkan dessverre ikke\b/,
    /\bdessverre ikke\b/,
    /\bjeg blir ikke med\b/,
    /\bvi blir ikke med\b/,
    /\bblir ikke med\b/,
    /\bmelder meg av\b/,
    /\bmeld meg av\b/,
    /\bkan ikke delta\b/,
    /\bdeltar ikke\b/,
  ];
  for (const pattern of negativePatterns) {
    if (pattern.test(normalized)) {
      return "declined";
    }
  }
  const positivePatterns = [
    /\bja\b/,
    /\bja takk\b/,
    /\bjeg kommer\b/,
    /\bvi kommer\b/,
    /\bkommer gjerne\b/,
    /\bjeg kommer gjerne\b/,
    /\bjeg blir med\b/,
    /\bvi blir med\b/,
    /\bblir med\b/,
    /\bmelder meg på\b/,
    /\bmeld meg på\b/,
    /\bjeg deltar\b/,
    /\bvi deltar\b/,
    /\bdeltar gjerne\b/,
  ];
  for (const pattern of positivePatterns) {
    if (pattern.test(normalized)) {
      return "attending";
    }
  }
  return null;
}
async function getReceivedEmail(emailId) {
  console.log("DEBUG: henter e-postinnhold fra Resend:", emailId);
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
    }
  );
  console.log("DEBUG: Resend hente-status:", response.status);
  if (!response.ok) {
    console.error(
      "DEBUG: kunne ikke hente mottatt e-post:",
      await response.text().catch(() => "")
    );
    return null;
  }
  return await response.json();
}
function normalizePhone(value) {
  let phone = String(value || "").replace(/[^\d+]/g, "");
  if (phone.startsWith("+47")) {
    phone = phone.slice(3);
  }
  if (phone.startsWith("0047")) {
    phone = phone.slice(4);
  }
  return /^\d{8}$/.test(phone) ? phone : null;
}
async function sendEmail(to, subject, text, replyTo = CLUB_EMAIL) {
  if (!RESEND_API_KEY || !to) {
    console.log("DEBUG: e-post hoppet over – mangler adresse eller Resend-nøkkel.");
    return false;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      text,
      reply_to: replyTo,
    }),
  });
  console.log("DEBUG: sendEmail status:", response.status, "til:", to);
  if (!response.ok) {
    console.error(
      "DEBUG: e-postsending feilet:",
      await response.text().catch(() => "")
    );
  }
  return response.ok;
}
async function sendSms(to, text) {
  const phone = normalizePhone(to);
  if (!phone || !SVEVE_USER || !SVEVE_API_KEY) {
    console.log("DEBUG: SMS hoppet over – mangler telefon eller Sveve-oppsett.");
    return false;
  }
  const response = await fetch("https://sveve.no/SMS/SendMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
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
  });
  console.log("DEBUG: SMS HTTP-status:", response.status);
  if (!response.ok) {
    console.error(
      "DEBUG: SMS-sending feilet:",
      await response.text().catch(() => "")
    );
  }
  return response.ok;
}
Deno.serve(async (req) => {
  console.log("DEBUG 1: receive-email-reply startet.");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    console.log("DEBUG STOPP: request var ikke POST.");
    return json(
      {
        success: false,
        error: "Kun POST er tillatt.",
      },
      405
    );
  }
  if (!SUPABASE_URL || !SECRET_KEY) {
    console.error("DEBUG STOPP: Supabase-konfigurasjon mangler.");
    return json(
      {
        success: false,
        error: "Supabase-konfigurasjon mangler.",
      },
      500
    );
  }
  if (!RESEND_WEBHOOK_SECRET) {
    console.error("DEBUG STOPP: RESEND_WEBHOOK_SECRET mangler.");
    return json(
      {
        success: false,
        error: "Webhook-secret mangler.",
      },
      500
    );
  }
  const rawPayload = await req.text();
  console.log("DEBUG 2: webhook-body mottatt.");
  let event;
  try {
    const webhook = new Webhook(RESEND_WEBHOOK_SECRET);
    webhook.verify(rawPayload, {
      "svix-id": req.headers.get("svix-id") || "",
      "svix-timestamp": req.headers.get("svix-timestamp") || "",
      "svix-signature": req.headers.get("svix-signature") || "",
    });
    event = JSON.parse(rawPayload);
    console.log("DEBUG 3: Resend-signatur godkjent.");
    console.log("DEBUG 3B: parsed eventtype:", event?.type);
  } catch (error) {
    console.error("DEBUG STOPP: ugyldig Resend-signatur:", error);
    return json(
      {
        success: false,
        error: "Ugyldig webhook-signatur.",
      },
      401
    );
  }
  console.log("DEBUG 4: eventtype:", event?.type);
  if (event?.type !== "email.received") {
    console.log("DEBUG STOPP: ikke email.received.");
    return json({
      success: true,
      ignored: true,
      reason: "Ikke email.received.",
    });
  }
  console.log("DEBUG 5: mottakerfelt:", event.data?.to);
  const token = extractReplyToken(event.data?.to);
  if (!token) {
    console.log("DEBUG STOPP: ingen gyldig arr-token.");
    return json({
      success: true,
      ignored: true,
      reason: "Ikke en arrangementsadresse.",
    });
  }
  console.log("DEBUG 6: arr-token funnet, case bevart.");
  let admin = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const tokenHash = await sha256Hex(token);
  console.log(
    "DEBUG 6B: Supabase URL brukt av funksjonen:",
    SUPABASE_URL
  );
  console.log(
    "DEBUG 6C: token-hash som søkes etter:",
    tokenHash
  );
  const {
    data: tokenRows,
    error: tokenLookupError,
  } = await admin
    .from("event_email_reply_tokens")
    .select("id,event_id,person_id,expected_email,token_hash,active,expires_at,last_reply_status,last_reply_at,club_id")
    .eq("token_hash", tokenHash);
  console.log(
    "DEBUG 6D: tokenoppslag data:",
    tokenRows
  );
  console.log(
    "DEBUG 6E: tokenoppslag error:",
    tokenLookupError
  );
  if (tokenLookupError) {
    console.error(
      "DEBUG STOPP: tokenoppslag feilet:",
      tokenLookupError
    );
    return json(
      {
        success: false,
        error: "Tokenoppslag feilet.",
      },
      500
    );
  }
  const replyToken =
    Array.isArray(tokenRows) &&
    tokenRows.length > 0
      ? tokenRows[0]
      : null;
  if (!replyToken) {
    console.log(
      "DEBUG STOPP: ingen rad funnet for token-hashen."
    );
    return json({
      success: true,
      ignored: true,
      reason: "Ukjent token.",
    });
  }
  console.log(
    "DEBUG 7: tokenrad funnet.",
    "id:",
    replyToken.id,
    "active:",
    replyToken.active,
    "event:",
    replyToken.event_id,
    "person:",
    replyToken.person_id
  );
  admin=createClubClient(replyToken.club_id);
  if (replyToken.active !== true) {
    console.log(
      "DEBUG STOPP: token finnes, men active er ikke true."
    );
    return json({
      success: true,
      ignored: true,
      reason: "Token er deaktivert.",
    });
  }
  if (
    replyToken.expires_at &&
    new Date(replyToken.expires_at).getTime() < Date.now()
  ) {
    console.log("DEBUG STOPP: token er utløpt.");
    return json({
      success: true,
      ignored: true,
      reason: "Token er utløpt.",
    });
  }
  const sender = extractEmail(event.data?.from || "");
  const expectedEmail = String(replyToken.expected_email || "")
    .trim()
    .toLowerCase();
  console.log(
    "DEBUG 8: avsender:",
    sender,
    "forventet:",
    expectedEmail
  );
  if (!sender || sender !== expectedEmail) {
    console.log("DEBUG STOPP: avsender samsvarer ikke.");
    return json({
      success: true,
      ignored: true,
      reason: "Avsender samsvarer ikke.",
    });
  }
  console.log("DEBUG 9: avsender godkjent.");
  const emailId = String(event.data?.email_id || "");
  if (!emailId) {
    console.log("DEBUG STOPP: mangler email_id.");
    return json({
      success: true,
      ignored: true,
      reason: "Mangler email_id.",
    });
  }
  const receivedEmail = await getReceivedEmail(emailId);
  if (!receivedEmail) {
    console.error("DEBUG STOPP: e-postinnhold kunne ikke hentes.");
    return json(
      {
        success: false,
        error: "Kunne ikke hente e-postinnhold.",
      },
      502
    );
  }
  console.log("DEBUG 10: e-postinnhold hentet.");
  const ownReply = extractOwnReply(String(receivedEmail.text || ""));
  console.log("DEBUG: brukerens egen svartekst:", ownReply);
  const participationStatus = interpretReply(
    String(receivedEmail.text || "")
  );
  console.log("DEBUG 11: tolket status:", participationStatus);
  const {
    data: eventRow,
    error: eventError,
  } = await admin
    .from("events")
    .select(
      "id,title,event_date,registration_deadline,allow_email_reply_registration,registration_form_enabled"
    )
    .eq("id", replyToken.event_id)
    .maybeSingle();
  if (eventError || !eventRow) {
    console.error(
      "DEBUG STOPP: arrangementet kunne ikke hentes:",
      eventError
    );
    return json(
      {
        success: false,
        error: "Arrangementet finnes ikke.",
      },
      404
    );
  }
  console.log(
    "DEBUG 12: arrangement funnet:",
    eventRow.title,
    "hurtigpåmelding:",
    eventRow.allow_email_reply_registration,
    "skjema:",
    eventRow.registration_form_enabled
  );
  if (
    !eventRow.allow_email_reply_registration ||
    eventRow.registration_form_enabled
  ) {
    console.log("DEBUG STOPP: hurtigpåmelding er ikke aktiv.");
    return json({
      success: true,
      ignored: true,
      reason: "Hurtigpåmelding er ikke aktiv.",
    });
  }
  if (
    eventRow.registration_deadline &&
    new Date(
      eventRow.registration_deadline + "T23:59:59"
    ).getTime() < Date.now()
  ) {
    console.log("DEBUG STOPP: påmeldingsfristen er utløpt.");
    return json({
      success: true,
      ignored: true,
      reason: "Påmeldingsfristen er utløpt.",
    });
  }
  const {
    data: person,
    error: personError,
  } = await admin
    .from("persons")
    .select("id,full_name,email,phone")
    .eq("id", replyToken.person_id)
    .maybeSingle();
  if (personError || !person) {
    console.error(
      "DEBUG STOPP: personen kunne ikke hentes:",
      personError
    );
    return json(
      {
        success: false,
        error: "Personen finnes ikke.",
      },
      404
    );
  }
  console.log("DEBUG 13: person funnet:", person.full_name);
  /*
   * Tvetydig svar:
   * Ikke endre påmelding, men send kopi til fellespost
   * slik at styret kan følge opp manuelt.
   */
  if (!participationStatus) {
    console.log("DEBUG STOPP: svaret kunne ikke tolkes entydig.");
    await sendEmail(
      CLUB_EMAIL,
      `Svar må følges opp manuelt – ${eventRow.title}`,
      `Det kom et svar på arrangementsinvitasjonen som ikke kunne tolkes automatisk.
Arrangement: ${eventRow.title}
Person: ${person.full_name}
E-post: ${person.email || expectedEmail}
Svartekst:
${ownReply || "(ingen lesbar svartekst)"}
Ingen påmeldingsstatus er endret automatisk.`,
      CLUB_EMAIL
    );
    return json({
      success: true,
      ignored: true,
      reason: "Ikke entydig JA eller NEI.",
    });
  }
  const {
    data: existing,
    error: existingError,
  } = await admin
    .from("event_participants")
    .select("id,event_id,person_id,status")
    .eq("event_id", replyToken.event_id)
    .eq("person_id", replyToken.person_id)
    .maybeSingle();
  if (existingError) {
    console.error(
      "DEBUG STOPP: deltakeroppslag feilet:",
      existingError
    );
    return json(
      {
        success: false,
        error: "Deltakeroppslag feilet.",
      },
      500
    );
  }
  if (existing) {
    const {
      error: updateError,
    } = await admin
      .from("event_participants")
      .update({
        status: participationStatus,
        guest_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) {
      console.error(
        "DEBUG STOPP: oppdatering av deltaker feilet:",
        updateError
      );
      return json(
        {
          success: false,
          error: "Påmeldingen kunne ikke oppdateres.",
        },
        500
      );
    }
    console.log("DEBUG 14: eksisterende deltaker oppdatert.");
  } else {
    const {
      error: insertError,
    } = await admin
      .from("event_participants")
      .insert({
        event_id: replyToken.event_id,
        person_id: replyToken.person_id,
        status: participationStatus,
        guest_count: 0,
        updated_at: new Date().toISOString(),
      });
    if (insertError) {
      console.error(
        "DEBUG STOPP: innsetting av deltaker feilet:",
        insertError
      );
      return json(
        {
          success: false,
          error: "Påmeldingen kunne ikke registreres.",
        },
        500
      );
    }
    console.log("DEBUG 14: ny deltaker registrert.");
  }
  const {
    error: tokenUpdateError,
  } = await admin
    .from("event_email_reply_tokens")
    .update({
      last_reply_status: participationStatus,
      last_reply_at: new Date().toISOString(),
      last_resend_email_id: emailId,
    })
    .eq("id", replyToken.id);
  if (tokenUpdateError) {
    console.error(
      "DEBUG: kunne ikke lagre svarstatus på token:",
      tokenUpdateError
    );
  } else {
    console.log("DEBUG 15: svarstatus lagret på token.");
  }
  const isAttending =
    participationStatus === "attending";
  const verb =
    isAttending
      ? "påmeldt"
      : "meldt av";
  const oppositeReply =
    isAttending
      ? "NEI"
      : "JA";
  const personalReplyTo =
    `arr-${token}@${INBOUND_DOMAIN}`;
  const confirmationSubject =
    isAttending
      ? `Bekreftelse på påmelding – ${eventRow.title}`
      : `Bekreftelse på avmelding – ${eventRow.title}`;
  const confirmationText =
`Hei ${person.full_name || ""}!
Du er nå ${verb} ${eventRow.title}.
Hvis dette ikke stemmer, kan du svare ${oppositeReply} på denne e-posten.
Med vennlig hilsen
Oslo Førerhundklubb`;
  const confirmationEmailSent =
    await sendEmail(
      person.email || expectedEmail,
      confirmationSubject,
      confirmationText,
      personalReplyTo
    );
  console.log(
    "DEBUG 16: bekreftelsesmail sendt:",
    confirmationEmailSent
  );
  const confirmationSmsSent =
    await sendSms(
      person.phone,
      `Oslo FHK: Du er nå ${verb} ${eventRow.title}. Hvis dette ikke stemmer, svar ${oppositeReply} på e-posten eller endre påmeldingen i medlemsportalen.`
    );
  console.log(
    "DEBUG 17: bekreftelses-SMS sendt:",
    confirmationSmsSent
  );
  /*
   * Fellespost får kopi av et gyldig svar.
   * Vi lagrer fortsatt ikke selve innkommende e-posten i databasen.
   */
  const clubCopySent =
    await sendEmail(
      CLUB_EMAIL,
      `${isAttending ? "Påmeldt" : "Avmeldt"} – ${eventRow.title} – ${person.full_name}`,
      `Automatisk behandlet svar på arrangementsinvitasjon.
Arrangement: ${eventRow.title}
Person: ${person.full_name}
E-post: ${person.email || expectedEmail}
Registrert status: ${isAttending ? "PÅMELDT" : "AVMELDT"}
Svartekst:
${ownReply || "(ingen lesbar svartekst)"}
Påmeldingsstatusen er oppdatert automatisk i medlemsportalen.`,
      CLUB_EMAIL
    );
  console.log(
    "DEBUG 18: kopi til fellespost sendt:",
    clubCopySent
  );
  console.log(
    "DEBUG FERDIG:",
    participationStatus
  );
  return json({
    success: true,
    processed: true,
    status: participationStatus,
    confirmationEmailSent,
    confirmationSmsSent,
    clubCopySent,
  });
});
