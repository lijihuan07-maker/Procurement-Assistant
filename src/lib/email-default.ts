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

/** Built-in RFQ email templates (always English: they go to suppliers). The requirement's own template is offered as "custom". */
export const EMAIL_PRESETS: Record<string, { label: string; tpl: EmailTemplate }> = {
  standard: { label: "标准询价", tpl: DEFAULT_EMAIL },
  urgent: {
    label: "紧急询价",
    tpl: {
      subject: "URGENT – Request for Quotation {rfqNo} – {title}",
      body: `Dear {contact},

We have an urgent requirement for our project {project} and kindly invite {supplier} to quote for the materials listed in the attached RFQ ({rfqNo}).

Please send your best price, available stock and the earliest delivery date to site by {deadline} at the latest. If you can only supply part of the items, please quote those items and state which ones you cannot supply.

Please quote every item in the unit stated in the RFQ, show VAT separately and state any deviation from the specification in the Remark column.

Thank you for your prompt reply.

Best regards,
{sender}
{company}`,
    },
  },
  revised: {
    label: "修订询价",
    tpl: {
      subject: "Revised Request for Quotation {rfqNo} – {title}",
      body: `Dear {contact},

Please find attached the revised RFQ ({rfqNo}) for our project {project}. It replaces the previous version: quantities, specifications or items may have changed.

Kindly submit your quotation based on the attached revision by {deadline}. If you have already quoted, please update your offer accordingly and mark the changes.

As before, quote every item in the unit stated in the RFQ, show VAT separately and state any deviation in the Remark column.

Best regards,
{sender}
{company}`,
    },
  },
};
