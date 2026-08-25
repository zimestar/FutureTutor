import "server-only";
import { getResendClient } from "./resendClient";
import { getEmailDeliveryMode, getEmailFromAddress } from "./emailDeliveryConfig";

export async function sendAdminInvitationEmail(input: { email: string; firstName: string; preset: string; setupUrl: string; locale: string }) {
  const fr = input.locale === "fr";
  const subject = fr ? "Invitation à rejoindre FutureTutor comme administrateur" : "You're invited to join FutureTutor as an Administrator";
  const text = fr ? `Bonjour ${input.firstName},\n\nVous êtes invité à rejoindre FutureTutor (${input.preset}). Terminez votre compte dans les 72 heures : ${input.setupUrl}` : `Hello ${input.firstName},\n\nYou are invited to join FutureTutor (${input.preset}). Complete your account within 72 hours: ${input.setupUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#102a43"><h1 style="color:#0b4f8a">FutureTutor</h1><p>${fr ? "Bonjour" : "Hello"} ${input.firstName},</p><p>${fr ? "Vous êtes invité à rejoindre FutureTutor comme administrateur." : "You're invited to join FutureTutor as an Administrator."}</p><p><strong>${input.preset}</strong></p><a href="${input.setupUrl}" style="display:inline-block;background:#1463ff;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${fr ? "Terminer votre compte" : "Complete your account"}</a><p>${fr ? "Cette invitation expire dans 72 heures." : "This invitation expires in 72 hours."}</p></div>`;
  if (getEmailDeliveryMode() === "console_dev") return;
  const result = await getResendClient().emails.send({ from: getEmailFromAddress(), to: input.email, subject, html, text });
  if (result.error) throw new Error("ADMIN_INVITATION_EMAIL_FAILED");
}
