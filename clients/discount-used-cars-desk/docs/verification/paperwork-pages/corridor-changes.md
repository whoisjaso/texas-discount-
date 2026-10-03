# Corridor changes: paperwork, page by page

Every screen of the Handle A Sale corridor that changed when the paperwork
became field maps (`src/lib/documents/field-maps/*`, `src/lib/sales/deal-facts.ts`).
The address of a paperwork question is
`/admin/sales/<deal>/paperwork/<document>/<key>`; a guide step is
`/admin/sales/<deal>/guide/<step>`. Anyone filming or scripting the desk
(the desk-walk scenarios, the demo storyboards) reads this first: a shot of a
screen listed here, taken before the change, no longer matches the desk.

| Document | Step / key | Before | Now |
|---|---|---|---|
| Bill of sale | `buyerLicenseState` | Two letters typed; the answer was dropped and every page printed "TX" | A tap on the state list, asked only when the intake did not say; the answer reaches the bill of sale, the 130-U box 15 and every ID line |
| Bill of sale | `odometerStatus` | Pre-selected "Real", filed unanswered | Pre-selected but sworn: the filing refuses it unanswered (`mustAnswer`) |
| Bill of sale | `tradeInVin` | Not asked; the trade-in VIN printed blank | New, right after "Is There A Trade-In?" and before the description: a VIN field (optional), so the car is identified before it is described |
| Bill of sale | `warrantyKind` | Not asked | New on a warranty sale: Full / Limited, a tap |
| Bill of sale | `warrantyLaborPercent`, `warrantyPartsPercent` | Not asked | New on a limited warranty: two numbers |
| Bill of sale | `warrantySystems` | Not asked | New: a multi-pick of the FTC form's systems |
| Bill of sale | `paymentMethod` | Stored keys printed raw ("CashApp") | Same taps; the paper prints "Cash App", and "Financing, <lender>" on a bank deal |
| 130-U | `countyOfResidence` | Typed, asked even when the intake decoded it | A list; skipped when the intake recorded the county |
| 130-U | `businessName`, `businessFein` | Not asked; a business buyer printed as a person | New after "Is The Buyer A Person Or A Business?" = Business |
| 130-U | `renewalReminders` | Not asked; box 26 assumed | New, only with an email on file: Yes / No |
| Financing | `downPayment` | Asked again after the money step | Skipped when the money step recorded what was paid today |
| Financing | `numberOfPayments` | Typed number | A tap on the desk's default term (36 Payments, labelled as that until the owner sets a house term) with a typed number behind "Another Number" |
| Financing | `apr` | Typed rate | A tap on the desk's starting rate with a typed rate behind "Another Rate"; still held to the car's legal ceiling |
| Financing | `firstPaymentDate` | Typed date, often left blank: the contract read "Monthly beginning" and printed no schedule | Two dates worked out from the contract date and the frequency (In One Week / In Two Weeks; In Two Weeks / In Four Weeks; In One Month / In Two Months) with a typed date behind "Another Date"; sworn (`mustAnswer`) |
| Salvage bill of sale | `howLeaving` | Defaulted | Sworn: On A Tow Truck / On A Trailer / On A Flatbed, never defaulted |
| Salvage bill of sale | `odometerStatus`, `buyerLicenseState`, `paymentMethod` | English only on a Spanish screen | Spoken in the operator's language, as on the bill of sale |
| Every document | review (`.../paperwork/<document>/review`) | A list of answers and the money, whatever the document printed | The page read back: each printed box in page order, its value, its source chip, Change on an answer, a red "missing" with the place it is fixed; the filing refuses a missing box by name (`fieldMissing`) |
| Rebuilt disclosure | review | Showed a sale price the state page never prints | Year, make, VIN, printed name, signature, date: the state page's boxes |
| Guide | `title` ("File The Title And Get Plates") | Shown on a sale the buyer registers | Absent when the buyer files: the packet is the last step |
| Guide | `packet` ("Print Or Save The Paperwork") | Done once any document was filed | Done once every document the sale owes is filed |
| Sale row | Buyer's Guide | Opened the template page | Opens the window copy (front and back) for this car, marked from the bill of sale's warranty answer |

New filing refusals, after every refusal that already existed and none
lifted by `DESK_ALLOW_UNSET_FACTS`: `mustAnswer`, `termsUnsolved`,
`rebuiltDisclosureFirst`, `poaInstrument`, `fieldMissing`.
