import type { EmailTemplate } from "@/db/schema";

export const DEFAULT_EMAIL: EmailTemplate = {
  subject: "Request for Quotation {rfqNo} – {title}",
  body: `Dear {contact},

We are pleased to invite {supplier} to submit your best quotation for the materials listed in the attached RFQ ({rfqNo}) for our project {project}.

Please note:
- Quote every item in the unit stated in the RFQ. If you price in another unit, state the conversion.
- State any deviation from the specification in the Remark column.
- Unit prices shall exclude VAT; please show VAT separately.

Kindly send your signed and stamped quotation by {deadline}, replying to this email and keeping all recipients in copy.

Best regards,
{sender}
{company}`,
};
