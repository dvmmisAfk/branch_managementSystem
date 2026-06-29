# Branch & State Facility Head (SFH) — Master Data Reference

> **Confidential — Internal Use Only**
> This document covers all branch and SFH records as defined in the application schema and seed roster.
> Scoring parameters, assessment categories, and audit logs are excluded.

---

## 1. State Facility Heads (SFH)

SFH personnel are the primary field representatives responsible for conducting branch visits and facility assessments.

### SFH Schema Fields

| Field | Description |
|---|---|
| Employee Code | Unique employee identifier (e.g. `SFH-001`) |
| Name | Full name of the SFH |
| Phone | Contact phone number |
| State / Region | Primary state region assigned |
| Email (System) | Synthetic system login email derived from employee code |
| Account Status | Active / Inactive |

### SFH Roster

| Employee Code | Name | State Region |
|---|---|---|
| SFH-001 | Ajay Kumar | Uttarakhand |
| SFH-002 | Anupam Sagar | Uttarakhand |
| SFH-003 | Shivendra Agrahari | Uttar Pradesh |
| SFH-004 | Anil Kumar | Rajasthan |
| SFH-005 | Dharmbir Singh | Haryana |

> **Note:** Each SFH manages branches across multiple states (see branch mappings below). The `State Region` above reflects the SFH's primary registration region, not an exclusive territory.

---

## 2. Branch Schema — Confidential Fields

These are all confidential data fields tracked per branch in the system. Not all fields may be populated for every branch.

### 2.1 Identity & Classification

| Field | Type | Notes |
|---|---|---|
| Branch Code | Unique String (max 20) | Primary identifier (e.g. `DR02`) |
| SAP Code | String (max 20) | SAP system reference code (e.g. `UT02`) |
| Branch Name | String (max 255) | Display name of the branch |
| Location | String (max 255) | Area / locality description |
| City | String (max 100) | City of operation |
| State | String (max 100) | State of operation |
| Zone | String (max 100) | Regional zone classification |
| Branch Type | Enum | `Vistaar` or `Non-Vistaar` |
| Date of Operationalization | Date | When the branch became operational |
| Is Active | Boolean | Current operational status |

### 2.2 Personnel (Confidential)

| Field | Type | Notes |
|---|---|---|
| BOI Name | String (max 255) | Branch Operations Incharge name |
| Branch Manager Name | String (max 255) | Name of the Branch Manager |
| Branch Operation Incharge | String (max 255) | Operations Incharge at branch |
| Premise Owner | String (max 255) | Owner of the physical premises |

### 2.3 Staff Strength

| Field | Type | Notes |
|---|---|---|
| Staff — Outsource | Integer | Count of outsourced staff |
| Staff — Company Roll | Integer | Count of staff on company payroll |
| Staff — HK Resources | Integer | Count of housekeeping staff |
| Staff — TALIC Employees | Integer | Count of TALIC-deployed employees |

### 2.4 Physical Infrastructure

| Field | Type | Notes |
|---|---|---|
| Carpet Area (sqft) | Decimal | Usable carpet area in square feet |
| Workstations — Linear | Integer | Count of linear workstations |
| Workstations — L-Shape | Integer | Count of L-shape workstations |
| Workstations — Cubical | Integer | Count of cubicle workstations |
| UPS Capacity (KVA) | Decimal | UPS installed capacity |
| UPS Backup Time (mins) | Integer | UPS battery backup duration |
| AC Tonnage | Decimal | Total air conditioning capacity |
| Electricity Load (KW) | Decimal | Sanctioned electricity load |
| Fire Extinguisher Count | Integer | Number of fire extinguishers installed |

### 2.5 DG & Utilities

| Field | Type | Notes |
|---|---|---|
| DG Ownership | Enum | `Owned` or `Rented` |
| DG Capacity (KVA) | Decimal | Diesel generator capacity |
| RMS Vendor Present | Boolean | Whether RMS vendor is engaged |
| RMS Vendor Name | String (max 255) | Name of the RMS vendor (if applicable) |

---

## 3. SFH ↔ Branch Mapping

Each branch is assigned to exactly one current SFH. Mappings track effective dates and approval status.

### Mapping Record Fields

| Field | Notes |
|---|---|
| SFH | The assigned State Facility Head |
| Branch | The branch being managed |
| Approval Status | `Pending` / `Approved` / `Rejected` |
| Approved By | Supervisor who approved the mapping |
| Approval Remarks | Notes from the supervisor |
| Effective From | Date mapping became active |
| Effective To | Date mapping ended (null = current) |
| Is Current | Boolean flag for the active mapping |

---

## 4. Branch Directory by State

Total branches in the system: **179**

### 4.1 Uttarakhand — 8 Branches

| Branch Code | SAP Code | Location | City | Assigned SFH |
|---|---|---|---|---|
| DR02 | UT02 | Dehradun | Dehradun | Ajay Kumar |
| RU02 | UT08 | Kashipur | Kashipur | Ajay Kumar |
| PG01 | UT09 | Pithoragarh | Pithoragarh | Ajay Kumar |
| DR03 | UT03 | Haridwar | Haridwar | Anupam Sagar |
| HD01 | UT04 | Nainital - Haldwani | Haldwani | Anupam Sagar |
| RU01 | UT05 | Rudrapur - Udham Singh Nagar | Rudrapur | Anupam Sagar |
| AL03 | UT06 | Almora | Almora | Anupam Sagar |
| GW05 | UT07 | Kotdwar | Garhwal | Anupam Sagar |

---

### 4.2 Uttar Pradesh — 62 Branches

| Branch Code | SAP Code | Location | City | Assigned SFH |
|---|---|---|---|---|
| AG02 | UP25 | Agra | Agra | Ajay Kumar |
| AG03 | UP85 | Agra - Fatehabad | Agra | Ajay Kumar |
| MT02 | UP54 | Mathura | Mathura | Ajay Kumar |
| FB03 | UP74 | Firozabad | Firozabad | Ajay Kumar |
| RM02 | UP96 | Rampur-UP | Rampur | Ajay Kumar |
| ND03 | UP11 | Ghaziabad - Kaushambi | Ghaziabad | Anupam Sagar |
| AD01 | UP15 | Aligarh | Aligarh | Anupam Sagar |
| MN01 | UP31 | Muzzafarnagar | Muzzafarnagar | Anupam Sagar |
| ME02 | UP28 | Meerut | Meerut | Anupam Sagar |
| MD03 | UP51 | Moradabad | Moradabad | Anupam Sagar |
| ND27 | DL22 | Noida | Noida | Anupam Sagar |
| SH02 | UP53 | Saharanpur | Saharanpur | Anupam Sagar |
| GN03 | UP63 | Greater Noida | Greater Noida | Anupam Sagar |
| GZ03 | UP64 | Ghaziabad | Ghaziabad | Anupam Sagar |
| BJ02 | UP61 | Bijnor | Bijnor | Anupam Sagar |
| HP02 | UP81 | Hapur | Hapur | Anupam Sagar |
| BU07 | UP78 | DM Road - Bulandshahar | Bulandshahar | Anupam Sagar |
| BP03 | UP91 | Baraut | Baraut | Anupam Sagar |
| GZ04 | UP76 | Indirapuram | Ghaziabad | Anupam Sagar |
| SM05 | UP95 | Shamli | Shamli | Anupam Sagar |
| FZ01 | UP06 | Faizabad | Faizabad | Shivendra Agrahari |
| VR02 | UP23 | Varanasi | Varanasi | Shivendra Agrahari |
| AL02 | UP20 | Allahabad | Allahabad | Shivendra Agrahari |
| KU02 | UP22 | Kanpur | Kanpur | Shivendra Agrahari |
| GK03 | UP27 | Gorakhpur | Gorakhpur | Shivendra Agrahari |
| LU03 | UP24 | Lucknow - Ratan Square | Lucknow | Shivendra Agrahari |
| BR04 | UP52 | Bareilly | Bareilly | Shivendra Agrahari |
| LU04 | UP55 | Lucknow - Indira Nagar | Lucknow | Shivendra Agrahari |
| JS02 | UP56 | Jhansi | Jhansi | Shivendra Agrahari |
| SJ02 | UP57 | Shahjahanpur | Shahjahanpur | Shivendra Agrahari |
| KU03 | UP59 | Kanpur - Ashok Nagar | Kanpur | Shivendra Agrahari |
| RB03 | UP60 | Raebareli | Raebareli | Shivendra Agrahari |
| LU05 | UP58 | Gomtinagar, Lucknow | Lucknow | Shivendra Agrahari |
| AZ02 | UP62 | Azamgarh | Azamgarh | Shivendra Agrahari |
| DE03 | UP65 | Deoria | Deoria | Shivendra Agrahari |
| SD02 | UP73 | Renukoot | Renukoot | Shivendra Agrahari |
| PZ02 | UP69 | Pratapgarh | Pratapgarh | Shivendra Agrahari |
| MZ04 | UP67 | Mirzapur | Mirzapur | Shivendra Agrahari |
| SR04 | UP71 | Sitapur | Sitapur | Shivendra Agrahari |
| FZ03 | UP72 | Gonda | Gonda | Shivendra Agrahari |
| BN03 | UP66 | Badaun | Badaun | Shivendra Agrahari |
| JU02 | UP68 | Jaunpur | Jaunpur | Shivendra Agrahari |
| HX01 | UP70 | Hardoi | Hardoi | Shivendra Agrahari |
| BA03 | UP75 | Ballia | Ballia | Shivendra Agrahari |
| BB04 | UP89 | Bara Banki | Bara Banki | Shivendra Agrahari |
| KH04 | UP86 | Lakhimpur-Kheri | Kheri | Shivendra Agrahari |
| BS06 | UP87 | Basti | Basti | Shivendra Agrahari |
| ET01 | UP88 | Etawah | Etawah | Shivendra Agrahari |
| GZ08 | UP79 | Ghazipur | Ghazipur | Shivendra Agrahari |
| GZ13 | UP84 | Shahadatpura | Shahadatpura | Shivendra Agrahari |
| FT02 | UP80 | Fatehpur | Fatehpur | Shivendra Agrahari |
| SQ02 | UP92 | Sultanpur | Sultanpur | Shivendra Agrahari |
| AU05 | UP83 | Auraiya | Auraiya | Shivendra Agrahari |
| JL03 | UP82 | Orai | Orai | Shivendra Agrahari |
| VR06 | UP77 | Varunapar | Varanasi | Shivendra Agrahari |
| GK04 | UP90 | Taramandal | Gorakhpur | Shivendra Agrahari |
| SD04 | UP93 | Robertsganj | Robertsganj | Shivendra Agrahari |
| BC03 | UP97 | Bahraich | Bahraich | Shivendra Agrahari |
| UN01 | UP98 | Unnao | Unnao | Shivendra Agrahari |
| SN04 | UP94 | Bhadohi | Bhadohi | Shivendra Agrahari |
| BB04 | UP89 | Bara Banki | Bara Banki | Shivendra Agrahari |

---

### 4.3 Rajasthan — 33 Branches

All Rajasthan branches are managed by **Anil Kumar (SFH-004)**.

| Branch Code | SAP Code | Location | City |
|---|---|---|---|
| SK01 | RJ08 | Sikar | Sikar |
| JD01 | RJ10 | Jodhpur | Jodhpur |
| UR02 | RJ21 | Udaipur | Udaipur |
| JA01 | RJ24 | Jaipur | Jaipur |
| KT03 | RJ39 | Kota | Kota |
| JA06 | RJ48 | Jaipur | Jaipur |
| BF03 | RJ44 | Bhilwara | Bhilwara |
| GG02 | RJ45 | Ganganagar | Ganganagar |
| BA02 | RJ42 | Bikaner | Bikaner |
| RH02 | RJ46 | Sadulpur | Rajgarh |
| AJ03 | RJ40 | Ajmer | Ajmer |
| PL02 | RJ47 | Pali | Pali |
| JJ02 | RJ43 | Jhunjhunu | Jhunjhunu |
| AW02 | RJ41 | Alwar | Alwar |
| HN01 | RJ52 | Hanumangarh | Hanumangarh |
| NU02 | RJ49 | Kuchaman | Kuchaman |
| BT03 | RJ50 | Bharatpur | Bharatpur |
| TN01 | RJ51 | Tonk | Tonk |
| BE02 | RJ53 | Balotra | Balotra |
| CR02 | RJ54 | Chittorgarh | Chittorgarh |
| JD03 | RJ57 | Jodhpur New | Jodhpur |
| UR04 | RJ55 | Rishabhdeo | Udaipur |
| JA08 | RJ58 | Bhinmal | Bhinmal |
| JA07 | RJ56 | Malviya Nagar - Jaipur | Jaipur |
| SI03 | RJ61 | Sirohi | Sirohi |
| UR07 | RJ60 | Banswara | Banswara |
| UR05 | RJ59 | Dungarpur | Dungarpur |
| SK03 | RJ62 | Neem Ka Thana | Neem Ka Thana |
| AW03 | RJ64 | Bhiwadi | Bhiwadi |
| JD04 | RJ63 | Phalodi | Phalodi |
| JH03 | RJ65 | Jhalawar | Jhalawar |
| GG03 | RJ66 | Suratgarh | Suratgarh |
| CR03 | RJ67 | Sujangarh | Sujangarh |

---

### 4.4 Punjab — 21 Branches

| Branch Code | SAP Code | Location | City | Assigned SFH |
|---|---|---|---|---|
| JN02 | PJ14 | Jalandhar | Jalandhar | Ajay Kumar |
| PA03 | PJ19 | Patiala | Patiala | Ajay Kumar |
| BT02 | PJ20 | Bhatinda | Bhatinda | Ajay Kumar |
| PA04 | PJ21 | Pathankot | Pathankot | Ajay Kumar |
| LD03 | PJ22 | Khanna, Ludhiana | Khanna | Ajay Kumar |
| RP01 | PJ28 | Rupnagar | Rupnagar | Ajay Kumar |
| KT08 | PJ34 | Phagwara | Phagwara | Ajay Kumar |
| FK01 | PJ35 | Faridkot | Faridkot | Ajay Kumar |
| BN04 | PJ36 | Barnala | Barnala | Ajay Kumar |
| LD02 | PJ06 | Ludhiana | Ludhiana | Dharmbir Singh |
| AM02 | PJ13 | Amritsar | Amritsar | Dharmbir Singh |
| HO02 | PJ24 | Hoshiarpur | Hoshiarpur | Dharmbir Singh |
| KT04 | PJ25 | Kapurthala | Kapurthala | Dharmbir Singh |
| GP01 | PJ26 | Gurdaspur | Gurdaspur | Dharmbir Singh |
| AM04 | PJ23 | Amritsar | Amritsar | Dharmbir Singh |
| NH01 | PJ30 | Nawanshahar | Nawanshahar | Dharmbir Singh |
| FR02 | PJ31 | Ferozpur | Ferozpur | Dharmbir Singh |
| MO02 | PJ29 | Moga | Moga | Dharmbir Singh |
| MK01 | PJ27 | Muktsar | Muktsar | Dharmbir Singh |
| FA01 | PJ32 | Abohar | Abohar | Dharmbir Singh |
| MH04 | PJ33 | Mohali | Mohali | Dharmbir Singh |

---

### 4.5 Haryana — 29 Branches

| Branch Code | SAP Code | Location | City | Assigned SFH |
|---|---|---|---|---|
| ND15 | HA10 | Gurugram | Gurugram | Ajay Kumar |
| FB02 | HA11 | Faridabad | Faridabad | Ajay Kumar |
| SY01 | HA14 | Sirsa | Sirsa | Ajay Kumar |
| BN02 | HA13 | Bhiwani | Bhiwani | Ajay Kumar |
| RE01 | HA16 | Rewari | Rewari | Ajay Kumar |
| ND25 | HA18 | Gurugram - Global Business Park | Gurugram | Ajay Kumar |
| PK03 | HA19 | Panchkula | Panchkula | Ajay Kumar |
| ND31 | HA22 | New Gurugram | Gurugram | Ajay Kumar |
| PW01 | HA24 | Palwal | Palwal | Ajay Kumar |
| RH03 | HA30 | Bahadurgarh | Bahadurgarh | Ajay Kumar |
| JH02 | HP13 | Jhajjar | Jhajjar | Ajay Kumar |
| NU03 | HP14 | Narnaul | Narnaul | Ajay Kumar |
| BN05 | HA33 | Charkhi Dadri | Charkhi Dadri | Ajay Kumar |
| KL01 | HA06 | Karnal | Karnal | Dharmbir Singh |
| RH01 | HA01 | Rohtak | Rohtak | Dharmbir Singh |
| HS01 | HA03 | Hisar | Hisar | Dharmbir Singh |
| JI01 | HA17 | Jind | Jind | Dharmbir Singh |
| NW01 | HA15 | Narwana | Narwana | Dharmbir Singh |
| PN02 | HA21 | Panipat | Panipat | Dharmbir Singh |
| AY02 | HA20 | Ambala | Ambala | Dharmbir Singh |
| KI03 | HA23 | Kaithal | Kaithal | Dharmbir Singh |
| KH03 | HA27 | Kurukshetra | Kurukshetra | Dharmbir Singh |
| YN01 | HA25 | Yamunanagar | Yamunanagar | Dharmbir Singh |
| SP02 | HA26 | Sonipat | Sonipat | Dharmbir Singh |
| HS03 | HA28 | Hisar - Extn | Hisar | Dharmbir Singh |
| FT01 | HA31 | Fatehabad | Fatehabad | Dharmbir Singh |
| SY04 | HA29 | Dabwali | Dabwali | Dharmbir Singh |
| HS04 | HA34 | Hansi | Hansi | Dharmbir Singh |
| FT03 | HA32 | Tohana | Tohana | Dharmbir Singh |

---

### 4.6 Delhi — 10 Branches

| Branch Code | SAP Code | Location | City | Assigned SFH |
|---|---|---|---|---|
| ND11 | DL06 | Delhi - Main Mathura Road | Delhi | Ajay Kumar |
| ND12 | DL07 | Delhi - Rohini | Delhi | Ajay Kumar |
| DW02 | DL20 | Delhi - Dwarka | Delhi | Ajay Kumar |
| ND26 | DL21 | Delhi - Janakpuri | Delhi | Ajay Kumar |
| ND28 | DL24 | Delhi - NSP | Delhi | Ajay Kumar |
| ND32 | DL28 | Naraina Vihar - New Delhi | New Delhi | Ajay Kumar |
| ND29 | DL25 | Delhi - Karkarduma | Delhi | Anupam Sagar |
| ND13 | DL13 | Himalaya House | Delhi | Dharmbir Singh |
| GR04 | DL26 | Hauz Khas | Delhi | Dharmbir Singh |
| MT03 | DL27 | Model Town | Delhi | Dharmbir Singh |

---

### 4.7 Himachal Pradesh — 9 Branches

All HP branches are managed by **Anupam Sagar (SFH-002)**.

| Branch Code | SAP Code | Location | City |
|---|---|---|---|
| MI02 | HP06 | Mandi | Mandi |
| SM04 | HP08 | Shimla | Shimla |
| KG02 | HP07 | Dharamshala, Kangra | Dharamshala |
| UA01 | HP09 | Una | Una |
| KL03 | HP10 | Kullu | Kullu |
| HM03 | HP12 | Hamirpur | Hamirpur |
| SN03 | HP11 | Solan | Solan |
| CB05 | HP16 | Chamba | Chamba |
| SM06 | HP15 | Rampur-HP | Rampur |

---

### 4.8 Jammu & Kashmir — 5 Branches

All J&K branches are managed by **Anupam Sagar (SFH-002)**.

| Branch Code | SAP Code | Location | City |
|---|---|---|---|
| JM05 | JM01 | Jammu | Jammu |
| JM06 | JM02 | Srinagar | Srinagar |
| KT06 | JM03 | Kathua | Kathua |
| UD02 | JM04 | Udhampur | Udhampur |
| RO01 | JM05 | Rajouri | Rajouri |

---

### 4.9 Ladakh — 1 Branch

Managed by **Anupam Sagar (SFH-002)**.

| Branch Code | SAP Code | Location | City |
|---|---|---|---|
| LH01 | LD01 | Leh | Leh |

---

### 4.10 Chandigarh — 1 Branch

Managed by **Dharmbir Singh (SFH-005)**.

| Branch Code | SAP Code | Location | City |
|---|---|---|---|
| CG03 | CH03 | Chandigarh | Chandigarh |

---

## 5. Branch Count Summary by State & SFH

| State / UT | Total Branches | Ajay Kumar | Anupam Sagar | Shivendra Agrahari | Anil Kumar | Dharmbir Singh |
|---|---|---|---|---|---|---|
| Uttarakhand | 8 | 3 | 5 | — | — | — |
| Uttar Pradesh | 62 | 5 | 20 | 40 | — | — |
| Rajasthan | 33 | — | — | — | 33 | — |
| Punjab | 21 | 9 | — | — | — | 12 |
| Haryana | 29 | 13 | — | — | — | 16 |
| Delhi | 10 | 6 | 1 | — | — | 3 |
| Himachal Pradesh | 9 | — | 9 | — | — | — |
| Jammu & Kashmir | 5 | — | 5 | — | — | — |
| Ladakh | 1 | — | 1 | — | — | — |
| Chandigarh | 1 | — | — | — | — | 1 |
| **Total** | **179** | **36** | **41** | **40** | **33** | **32** |

---

## 6. Branch Visit Metadata (Per Visit Record)

The following confidential operational details are captured per branch visit (excluding scores):

| Field | Notes |
|---|---|
| Visit Date | Actual date of the visit |
| Visit Type | `Physical` or `Virtual` |
| Previous Visit Date | Date of the prior quarter's visit |
| Virtual Contact Name | Staff contact name for virtual visits |
| Virtual Contact Phone | Staff contact phone for virtual visits |
| Reason for No Visit | If visit was skipped, documented reason |
| BOI Name (Snapshot) | BOI name at time of visit |
| Location Head (Snapshot) | Location head name at time of visit |
| Staff Snapshot | Outsource / Company / HK / TALIC counts at visit time |
| Workstation Snapshot | Linear / L-Shape / Cubical counts at visit time |
| Is Infra Upgrade | Flag if infrastructure upgrade is ongoing |
| Landlord Issue | Flag if premise landlord issue exists |
| Landlord Issue Details | Description of landlord issue |
| Incident Since Previous Visit | Flag if any incident occurred |
| Incident Details | Description of the incident |
| Audit Points Observed | Flag for audit observations |
| Audit Points Details | Description of audit points |
| Major Escalation | Flag for major escalation |
| Escalation Details | Escalation description |
| Escalation Closure Date | Target date for escalation closure |
| Electricity Last Quarter (units/amount) | Utility consumption data |
| Submission Status | Whether the visit report is submitted |
| Submitted At | Timestamp of report submission |
| Signed by SFH At | Timestamp of SFH digital sign-off |
| Signed by Ops Incharge At | Timestamp of Ops Incharge sign-off |
| Signed by Location Head At | Timestamp of Location Head sign-off |

---

*Last updated from schema: Prisma schema v1 with all migrations applied through 2026-06-29.*
