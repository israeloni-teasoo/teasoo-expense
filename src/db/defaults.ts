/** Reference data created for a new organisation (and by the demo seed). */
export const DEFAULT_DEPARTMENTS = ["Finance", "Operations", "IT", "Marketing", "HR", "Administration"];

export const DEFAULT_CATEGORIES: { name: string; keywords: string; receiptRequired?: boolean }[] = [
  { name: "Transportation", keywords: "transport,taxi,uber,bolt,fuel,bus,flight,fare,logistics van" },
  { name: "Accommodation", keywords: "hotel,lodging,airbnb,accommodation,room" },
  { name: "Meals", keywords: "lunch,dinner,breakfast,food,meal,catering,refreshment" },
  { name: "Office Supplies", keywords: "stationery,paper,pens,toner,ink,supplies,office" },
  { name: "Software", keywords: "subscription,adobe,canva,license,saas,software,microsoft,google workspace,zoom" },
  { name: "Internet", keywords: "internet,wifi,data,bandwidth,isp,router" },
  { name: "Printing", keywords: "printing,print,banner,flyer,photocopy,branding" },
  { name: "Logistics", keywords: "delivery,courier,dispatch,haulage,logistics" },
  { name: "Events", keywords: "venue,event,conference,hall,decoration,decor" },
  { name: "Marketing", keywords: "advert,ads,marketing,promotion,campaign,social media" },
  { name: "Equipment", keywords: "laptop,monitor,equipment,chair,projector,hardware" },
  { name: "Repairs", keywords: "repair,maintenance,fix,servicing" },
  { name: "Professional Services", keywords: "consultant,legal,audit,professional,contractor" },
  { name: "Utilities", keywords: "electricity,diesel,water,utility,nepa,generator" },
  { name: "Miscellaneous", keywords: "misc,other,sundry", receiptRequired: false },
];
