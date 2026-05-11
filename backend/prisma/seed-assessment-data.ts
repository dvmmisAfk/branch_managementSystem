/** Assessment categories and 45 sub-categories per master specification §3.6–3.7 */

export type SubSeed = {
  displayOrder: number;
  name: string;
  description: string;
  maxScore: number;
};

export type CatSeed = {
  displayOrder: number;
  name: string;
  maxPoints: number;
  subcategories: SubSeed[];
};

export const categorySeeds: CatSeed[] = [
  {
    displayOrder: 1,
    name: "Housekeeping",
    maxPoints: 50,
    subcategories: [
      {
        displayOrder: 1,
        name: "Branch Cleaning",
        description:
          "Front office, Back office, Training Room, Pantry, Rest Rooms, Electrical Room, Store Room, workstations, Floor area and dusting of false ceiling area.",
        maxScore: 5,
      },
      { displayOrder: 2, name: "Deep cleaning activity", description: "Check Points: deep cleaning schedule and evidence.", maxScore: 5 },
      { displayOrder: 3, name: "Housekeeping material availability", description: "Check Points: materials stocked and accessible.", maxScore: 5 },
      {
        displayOrder: 4,
        name: "Walls of office areas",
        description: "Whether walls of office areas is free from tapes, strains, dampness.",
        maxScore: 5,
      },
      {
        displayOrder: 5,
        name: "Pest control",
        description: "Whether pest control regularly happening, is there any rodent issues in the branch.",
        maxScore: 5,
      },
      {
        displayOrder: 6,
        name: "Pantry utensils",
        description: "Whether the utensils of the pantry is being cleaned on daily basis.",
        maxScore: 5,
      },
      {
        displayOrder: 7,
        name: "Fans & exhaust",
        description: "Whether office fans & Exhaust fans are in working condition.",
        maxScore: 5,
      },
      {
        displayOrder: 8,
        name: "Washroom condition",
        description:
          "Washroom floor, WC, wash basin, urinals, mirrors, health faucet, soap dispenser, tissue paper fitting conditions & cleaning activity.",
        maxScore: 5,
      },
      { displayOrder: 9, name: "Wash room checklist", description: "Whether wash room checklist maintained.", maxScore: 5 },
      {
        displayOrder: 10,
        name: "Drainage, leakage, water supply, waste management",
        description: "Need to check drainage system, leakage and adequate water supply availability, Waste Management.",
        maxScore: 5,
      },
    ],
  },
  {
    displayOrder: 2,
    name: "Safety and Security",
    maxPoints: 70,
    subcategories: [
      { displayOrder: 1, name: "Registers", description: "Check Points: required registers maintained and updated.", maxScore: 5 },
      { displayOrder: 2, name: "HK Resources Uniform", description: "Check Points: uniform compliance.", maxScore: 5 },
      { displayOrder: 3, name: "Branch Keys", description: "Check Points: key control and register.", maxScore: 5 },
      {
        displayOrder: 4,
        name: "Fire Fighting Equipments availability (RMS & TALIC)",
        description: "Check Points: availability and completeness.",
        maxScore: 5,
      },
      {
        displayOrder: 5,
        name: "Fire extinguishers placement & condition",
        description:
          "Whether all FE are in right place and working condition, FE's are labelled with auto glow signage.",
        maxScore: 5,
      },
      {
        displayOrder: 6,
        name: "Fire Exit layout",
        description: "Fire Exit layout & Fire Exit are displayed at appropriate places.",
        maxScore: 5,
      },
      {
        displayOrder: 7,
        name: "Safety Office & Fire warden markings",
        description: "Position of Safety Office & Fire warden marked in the branch.",
        maxScore: 5,
      },
      {
        displayOrder: 8,
        name: "Safety organisation chart & posters",
        description:
          "Whether safety organisation chart, Fire Safety posters are available and Safe Assembly point is notified.",
        maxScore: 5,
      },
      { displayOrder: 9, name: "FAS connected to UPS", description: "Whether FAS connected to UPS (For RMS Direct Connection).", maxScore: 5 },
      {
        displayOrder: 10,
        name: "Zones & smoke detector display",
        description: "Whether zones are identified along with details of smoke detector and displayed near FAS wherever applicable.",
        maxScore: 5,
      },
      {
        displayOrder: 11,
        name: "CCTV",
        description: "Whether CC TV is available and its placement, working condition.",
        maxScore: 5,
      },
      { displayOrder: 12, name: "Fire Drill Report", description: "Fire Drill Report to be checked.", maxScore: 5 },
      {
        displayOrder: 13,
        name: "HK deployment & ID cards",
        description:
          "Whether deployment letter of HK resources available at the branch, ID cards of HK resources are valid and signed.",
        maxScore: 5,
      },
      { displayOrder: 14, name: "Fire Exit routes accessibility", description: "Fire Exit routes are free to access for the users.", maxScore: 5 },
    ],
  },
  {
    displayOrder: 3,
    name: "Facilities",
    maxPoints: 45,
    subcategories: [
      {
        displayOrder: 1,
        name: "Painting / dampness",
        description: "Whether branch or part of branch requires painting, is there any dampness in the wall.",
        maxScore: 5,
      },
      {
        displayOrder: 2,
        name: "Shutters, doors, windows",
        description: "Working condition of Shutter, all doors, windows in the branch to be checked.",
        maxScore: 5,
      },
      { displayOrder: 3, name: "Unwanted materials", description: "Unwanted materials in the branch.", maxScore: 5 },
      { displayOrder: 4, name: "Workstations, Pedestal, Storage", description: "Condition of Workstations, Pedestal, Storage.", maxScore: 5 },
      { displayOrder: 5, name: "Blinds", description: "Working condition of blinds.", maxScore: 5 },
      { displayOrder: 6, name: "Lights", description: "Working condition of lights.", maxScore: 5 },
      { displayOrder: 7, name: "Asset tagging", description: "Whether all the assets are tagged with asset code.", maxScore: 5 },
      { displayOrder: 8, name: "Repairs (Good to Have)", description: "Whether any repairs required in the branch (Good to Have).", maxScore: 5 },
      { displayOrder: 9, name: "Repairs (Must to Have)", description: "Whether any repairs required in the branch (Must to Have).", maxScore: 5 },
    ],
  },
  {
    displayOrder: 4,
    name: "Office Equipments",
    maxPoints: 38,
    subcategories: [
      {
        displayOrder: 1,
        name: "Microwave, vending, water dispenser",
        description: "Working condition of Microwave, Coffee/Tea Vending machine, water dispenser.",
        maxScore: 5,
      },
      {
        displayOrder: 2,
        name: "AC temperature",
        description: "Whether proper AC temperature maintained in office & in electrical room.",
        maxScore: 5,
      },
      {
        displayOrder: 3,
        name: "DG ownership & placement",
        description: "Whether DG is owned or rented, placement of DG, Panel checkings.",
        maxScore: 5,
      },
      {
        displayOrder: 4,
        name: "Inverter set",
        description: "Whether Inverter set is in good condition wherever it is applicable.",
        maxScore: 3,
      },
      {
        displayOrder: 5,
        name: "Earthing, load, UPS placement",
        description:
          "Whether earthing is available to UPS & branch, sufficient load available, backup condition, correct placement of UPS & Batteries.",
        maxScore: 5,
      },
      {
        displayOrder: 6,
        name: "AC & ODU",
        description:
          "Working condition of AC and installation of ODU in safe place for servicing, whether tonnage is accurate at the branch.",
        maxScore: 5,
      },
      { displayOrder: 7, name: "Chairs & Sofa", description: "Condition of Chairs & Sofa.", maxScore: 5 },
      {
        displayOrder: 8,
        name: "PPM / AMC reports",
        description: "PPM or AMC reports of DG, AC, UPS, Inverter reports are available in the branch.",
        maxScore: 5,
      },
    ],
  },
  {
    displayOrder: 5,
    name: "Compliance",
    maxPoints: 20,
    subcategories: [
      {
        displayOrder: 1,
        name: "Certificates & boards",
        description:
          "No smoking boards, S&E certificates, Trade License certificates are available and its validity to be checked.",
        maxScore: 5,
      },
      {
        displayOrder: 2,
        name: "Minimum wages notice",
        description: "Current minimum wages details are available in notice board.",
        maxScore: 5,
      },
      {
        displayOrder: 3,
        name: "Statutory & glow sign boards",
        description: "Statutory Sign board & Glow sign board is available at the entrance & outside respectively.",
        maxScore: 5,
      },
      {
        displayOrder: 4,
        name: "HK salary timelines",
        description: "Whether all the HK resources are getting salaries within 10th of every month.",
        maxScore: 5,
      },
    ],
  },
];
