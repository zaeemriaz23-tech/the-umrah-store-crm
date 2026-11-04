/* Built-in airport directory for the search autocomplete (code, city, airport, country). No external call. */
const A = `LHE|Lahore|Allama Iqbal Intl|Pakistan
KHI|Karachi|Jinnah Intl|Pakistan
ISB|Islamabad|Islamabad Intl|Pakistan
PEW|Peshawar|Bacha Khan Intl|Pakistan
MUX|Multan|Multan Intl|Pakistan
SKT|Sialkot|Sialkot Intl|Pakistan
LYP|Faisalabad|Faisalabad Intl|Pakistan
UET|Quetta|Quetta Intl|Pakistan
RYK|Rahim Yar Khan|Shaikh Zayed Intl|Pakistan
GWD|Gwadar|Gwadar Intl|Pakistan
MFG|Muzaffarabad|Muzaffarabad|Pakistan
JED|Jeddah|King Abdulaziz Intl|Saudi Arabia
MED|Madinah|Prince Mohammad bin Abdulaziz|Saudi Arabia
RUH|Riyadh|King Khalid Intl|Saudi Arabia
DMM|Dammam|King Fahd Intl|Saudi Arabia
TIF|Taif|Taif Intl|Saudi Arabia
YNB|Yanbu|Yanbu|Saudi Arabia
AHB|Abha|Abha Intl|Saudi Arabia
TUU|Tabuk|Tabuk Regional|Saudi Arabia
DXB|Dubai|Dubai Intl|UAE
DWC|Dubai|Al Maktoum Intl|UAE
SHJ|Sharjah|Sharjah Intl|UAE
AUH|Abu Dhabi|Zayed Intl|UAE
DOH|Doha|Hamad Intl|Qatar
BAH|Manama|Bahrain Intl|Bahrain
KWI|Kuwait City|Kuwait Intl|Kuwait
MCT|Muscat|Muscat Intl|Oman
AMM|Amman|Queen Alia Intl|Jordan
CAI|Cairo|Cairo Intl|Egypt
IST|Istanbul|Istanbul Airport|Turkey
SAW|Istanbul|Sabiha Gokcen|Turkey
LHR|London|Heathrow|United Kingdom
LGW|London|Gatwick|United Kingdom
STN|London|Stansted|United Kingdom
MAN|Manchester|Manchester|United Kingdom
BHX|Birmingham|Birmingham|United Kingdom
GLA|Glasgow|Glasgow|United Kingdom
EDI|Edinburgh|Edinburgh|United Kingdom
CDG|Paris|Charles de Gaulle|France
AMS|Amsterdam|Schiphol|Netherlands
FRA|Frankfurt|Frankfurt|Germany
MUC|Munich|Munich|Germany
BRU|Brussels|Brussels|Belgium
ZRH|Zurich|Zurich|Switzerland
MAD|Madrid|Barajas|Spain
BCN|Barcelona|El Prat|Spain
FCO|Rome|Fiumicino|Italy
MXP|Milan|Malpensa|Italy
OSL|Oslo|Gardermoen|Norway
CPH|Copenhagen|Kastrup|Denmark
ARN|Stockholm|Arlanda|Sweden
JFK|New York|John F. Kennedy|USA
EWR|Newark|Newark Liberty|USA
IAD|Washington|Dulles|USA
ORD|Chicago|O'Hare|USA
LAX|Los Angeles|Los Angeles Intl|USA
IAH|Houston|George Bush Intl|USA
YYZ|Toronto|Pearson|Canada
YVR|Vancouver|Vancouver Intl|Canada
SYD|Sydney|Kingsford Smith|Australia
MEL|Melbourne|Tullamarine|Australia
DEL|Delhi|Indira Gandhi Intl|India
BOM|Mumbai|Chhatrapati Shivaji|India
KUL|Kuala Lumpur|Kuala Lumpur Intl|Malaysia
SIN|Singapore|Changi|Singapore
BKK|Bangkok|Suvarnabhumi|Thailand
CGK|Jakarta|Soekarno-Hatta|Indonesia
HKG|Hong Kong|Hong Kong Intl|Hong Kong
PEK|Beijing|Capital|China
PVG|Shanghai|Pudong|China
CAN|Guangzhou|Baiyun|China
DAC|Dhaka|Hazrat Shahjalal|Bangladesh
CMB|Colombo|Bandaranaike|Sri Lanka
KBL|Kabul|Kabul Intl|Afghanistan
TAS|Tashkent|Islam Karimov|Uzbekistan
BAK|Baku|Heydar Aliyev|Azerbaijan
CMN|Casablanca|Mohammed V|Morocco
JNB|Johannesburg|O. R. Tambo|South Africa`.split('\n').map(l => { const [code, city, name, country] = l.split('|'); return { code, city, name, country, k: (code + ' ' + city + ' ' + name + ' ' + country).toLowerCase() }; });

function find(q, n = 8) {
  q = String(q || '').trim().toLowerCase(); if (!q) return A.filter(a => ['LHE', 'KHI', 'ISB', 'JED', 'MED', 'DXB', 'DOH', 'LHR'].includes(a.code)).map(({ k, ...r }) => r);
  const sc = a => a.code.toLowerCase() === q ? 0 : a.code.toLowerCase().startsWith(q) ? 1 : a.city.toLowerCase().startsWith(q) ? 2 : a.name.toLowerCase().startsWith(q) ? 3 : a.k.includes(q) ? 4 : 9;
  return A.map(a => [sc(a), a]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => { const { k, ...r } = x[1]; return r; });
}
module.exports = { find };
