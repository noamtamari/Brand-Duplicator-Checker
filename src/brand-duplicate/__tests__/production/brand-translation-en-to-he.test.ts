import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandResponse } from "../../brand-adapter.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import { BrandIndex } from "../../brand-index.js";

/**
 * English input against a Hebrew-only label. The dataset holds 5,121 of them, and this
 * direction had no coverage before.
 *
 * The suite asserts the duplicate is not silently allowed: BLOCK and HUMAN_REVIEW both pass,
 * ALLOW fails. Review is a correct outcome here rather than a shortfall — these pairings rest on
 * a generated spelling, and putting such a name in front of a person is what the review state is
 * for. Only ALLOW creates the duplicate outright, which is the failure this guards against.
 *
 * Every expected code was verified against response.json, and every input is absent
 * from the catalogue as written — including as a Latin label, which an earlier revision of this
 * matrix did not check. Nineteen cases then blocked on a Latin twin of the input and never
 * exercised the cross-language path at all; they have been replaced.
 *
 * See docs/manual-tests/english-to-hebrew-test-cases.md for the status table and root cause.
 */
type TranslationCase = {
  id: string;
  input: string;
  expectedCode: string;
  expectedLabel: string;
  note: string;
};

const responsePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../response.json");
const response = JSON.parse(await readFile(responsePath, "utf8")) as unknown;
const brands = parseBrandResponse(response);
const checker = new BrandDuplicateChecker(new BrandIndex(brands));

const translationCases: TranslationCase[] = [
  { id: "EN001", input: "Garsini", expectedCode: "b_4354", expectedLabel: "גרסיני", note: "Retrieved, held at review" },
  { id: "EN002", input: "Selected", expectedCode: "b_2071", expectedLabel: "סלקטד", note: "Retrieved, held at review" },
  { id: "EN003", input: "Kedem", expectedCode: "b_1419", expectedLabel: "קדם", note: "Retrieved, held at review" },
  { id: "EN004", input: "Rozmax", expectedCode: "b_4629", expectedLabel: "רוזמקס", note: "Retrieved, held at review" },
  { id: "EN005", input: "Life", expectedCode: "b_382", expectedLabel: "לייף", note: "Retrieved, held at review" },
  { id: "EN006", input: "Pantene", expectedCode: "b_355", expectedLabel: "פנטן", note: "Retrieved, held at review" },
  { id: "EN007", input: "Reebok", expectedCode: "b_2258", expectedLabel: "ריבוק", note: "Retrieved, held at review" },
  { id: "EN008", input: "Simply Clinic", expectedCode: "b_3556", expectedLabel: "סימפלי קליניק", note: "Retrieved, held at review" },
  { id: "EN009", input: "Adam Gold", expectedCode: "b_3595", expectedLabel: "אדם גולד", note: "Retrieved, held at review" },
  { id: "EN010", input: "Adam Silver", expectedCode: "b_3596", expectedLabel: "אדם סילבר", note: "Retrieved, held at review" },
  { id: "EN011", input: "Natural Diet", expectedCode: "b_4709", expectedLabel: "נטורל דיאט", note: "Retrieved, held at review" },
  { id: "EN012", input: "Kalcicho", expectedCode: "b_2827", expectedLabel: "קלציצ'ו", note: "Retrieved, held at review" },
  { id: "EN013", input: "Tamar Shivuk", expectedCode: "b_4558", expectedLabel: "תמר שיווק", note: "Retrieved, held at review" },
  { id: "EN014", input: "Tea London", expectedCode: "b_4343", expectedLabel: "תה לונדון", note: "Retrieved, held at review" },
  { id: "EN015", input: "Colgate", expectedCode: "b_642", expectedLabel: "קולגייט", note: "Recall miss; duplicate allowed" },
  { id: "EN016", input: "Dove", expectedCode: "b_324", expectedLabel: "דאב", note: "Recall miss" },
  { id: "EN017", input: "Dettol", expectedCode: "b_4166", expectedLabel: "דטול", note: "Retrieved, held at review" },
  { id: "EN018", input: "Orbit", expectedCode: "b_955", expectedLabel: "אורביט", note: "Retrieved, held at review" },
  { id: "EN019", input: "Tide", expectedCode: "b_849", expectedLabel: "טייד", note: "Retrieved, held at review" },
  { id: "EN020", input: "Pepsi", expectedCode: "b_1099", expectedLabel: "פפסי", note: "Retrieved, held at review" },
  { id: "EN021", input: "Lipton", expectedCode: "b_2002", expectedLabel: "ליפטון", note: "Retrieved, held at review" },
  { id: "EN022", input: "Knorr", expectedCode: "b_4907", expectedLabel: "קנור", note: "Retrieved, held at review" },
  { id: "EN023", input: "Materna", expectedCode: "b_3516", expectedLabel: "מטרנה", note: "Retrieved, held at review" },
  { id: "EN024", input: "Voltaren", expectedCode: "b_3282", expectedLabel: "וולטרן", note: "Retrieved, held at review" },
  { id: "EN025", input: "Trisa", expectedCode: "b_656", expectedLabel: "טריזה", note: "Retrieved, held at review" },
  { id: "EN026", input: "Castro", expectedCode: "b_46", expectedLabel: "קסטרו", note: "Retrieved, held at review" },
  { id: "EN027", input: "Swiffer", expectedCode: "b_4950", expectedLabel: "סוויפר", note: "Retrieved, held at review" },
  { id: "EN028", input: "Trident", expectedCode: "b_1002", expectedLabel: "טרידנט", note: "Retrieved, held at review" },
  { id: "EN029", input: "Tiger", expectedCode: "b_997", expectedLabel: "טייגר", note: "Retrieved, held at review" },
  { id: "EN030", input: "Dermacol", expectedCode: "b_4491", expectedLabel: "דרמקול", note: "Retrieved, held at review" },
  { id: "EN031", input: "Isostar", expectedCode: "b_449", expectedLabel: "איזוסטאר", note: "Recall miss; duplicate allowed" },
  { id: "EN032", input: "Kikkoman", expectedCode: "b_4996", expectedLabel: "קיקומן", note: "Retrieved, held at review" },
  { id: "EN033", input: "Elegant", expectedCode: "b_1345", expectedLabel: "אלגנט", note: "Retrieved, held at review" },
  { id: "EN034", input: "Narkis", expectedCode: "b_134", expectedLabel: "נרקיס", note: "Retrieved, held at review" },
  { id: "EN035", input: "Sensodyne", expectedCode: "b_637", expectedLabel: "סנסודיין", note: "Retrieved, held at review" },
  { id: "EN036", input: "Minolta", expectedCode: "b_2173", expectedLabel: "מינולטה", note: "Retrieved, held at review" },
  { id: "EN037", input: "Quaker", expectedCode: "b_2139", expectedLabel: "קוואקר", note: "Recall miss; duplicate allowed" },
  { id: "EN038", input: "Lenor", expectedCode: "b_304", expectedLabel: "לנור", note: "Retrieved, held at review" },
  { id: "EN039", input: "Nesty", expectedCode: "b_1110", expectedLabel: "נסטי", note: "Retrieved, held at review" },
  { id: "EN040", input: "Aroma", expectedCode: "b_1987", expectedLabel: "ארומה", note: "Retrieved, held at review" },
  { id: "EN041", input: "Delta", expectedCode: "b_3153", expectedLabel: "דלתא", note: "Retrieved, held at review" },
  { id: "EN042", input: "Remedia", expectedCode: "b_3071", expectedLabel: "רמדיה", note: "Retrieved, held at review" },
  { id: "EN043", input: "Scorpio", expectedCode: "b_471", expectedLabel: "סקורפיו", note: "Retrieved, held at review" },
  { id: "EN044", input: "Gastro", expectedCode: "b_4790", expectedLabel: "גסטרו", note: "Retrieved, held at review" },
  { id: "EN045", input: "Otrivin", expectedCode: "b_3309", expectedLabel: "אוטריוין", note: "Retrieved, held at review" },
  { id: "EN046", input: "Ronson", expectedCode: "b_2074", expectedLabel: "רונסון", note: "Retrieved, held at review" },
  { id: "EN047", input: "Jordan", expectedCode: "b_653", expectedLabel: "ג'ורדן", note: "Retrieved, held at review" },
  { id: "EN048", input: "Wings", expectedCode: "b_270", expectedLabel: "וינגס", note: "Retrieved, held at review" },
  { id: "EN049", input: "Finish", expectedCode: "b_877", expectedLabel: "פיניש", note: "Retrieved, held at review" },
  { id: "EN050", input: "Borsalino", expectedCode: "b_1658", expectedLabel: "בורסלינו", note: "Retrieved, held at review" },
  { id: "EN051", input: "Atarax", expectedCode: "b_2558", expectedLabel: "אטרקס", note: "Retrieved, held at review" },
  { id: "EN052", input: "Always", expectedCode: "b_301", expectedLabel: "אולוויז", note: "Recall miss" },
  { id: "EN053", input: "Spiral", expectedCode: "b_3885", expectedLabel: "ספירל", note: "Retrieved, held at review" },
  { id: "EN054", input: "Havana", expectedCode: "b_287", expectedLabel: "הוונה", note: "Recall miss" },
  { id: "EN055", input: "Fishermans", expectedCode: "b_1046", expectedLabel: "פישרמנס", note: "Retrieved, held at review" },
  { id: "EN056", input: "Blackberry", expectedCode: "b_4730", expectedLabel: "בלקברי", note: "Retrieved, held at review" },
  { id: "EN057", input: "Landwer", expectedCode: "b_4240", expectedLabel: "לנדוור", note: "Retrieved, held at review" },
  { id: "EN058", input: "Angora", expectedCode: "b_918", expectedLabel: "אנגורה", note: "Retrieved, held at review" },
  { id: "EN059", input: "Crave", expectedCode: "b_3251", expectedLabel: "קרייב", note: "Recall miss" },
  { id: "EN060", input: "Superman", expectedCode: "b_2168", expectedLabel: "סופרמן", note: "Retrieved, held at review" },
  { id: "EN061", input: "Talisman", expectedCode: "b_215", expectedLabel: "טליסמן", note: "Retrieved, held at review" },
  { id: "EN062", input: "Romeo", expectedCode: "b_208", expectedLabel: "רומאו", note: "Retrieved, held at review" },
  { id: "EN063", input: "Nobile", expectedCode: "b_1883", expectedLabel: "נוביל", note: "Retrieved, held at review" },
  { id: "EN064", input: "Petit", expectedCode: "b_1179", expectedLabel: "פטיט", note: "Retrieved, held at review" },
  { id: "EN065", input: "Portofino", expectedCode: "b_4017", expectedLabel: "פורטופינו", note: "Retrieved, held at review" },
  { id: "EN066", input: "Clara", expectedCode: "b_4184", expectedLabel: "קלרה", note: "Retrieved, held at review" },
  { id: "EN067", input: "Levanta", expectedCode: "b_2042", expectedLabel: "לוונטה", note: "Recall miss" },
  { id: "EN068", input: "Sidol", expectedCode: "b_913", expectedLabel: "סידול", note: "Retrieved, held at review" },
  { id: "EN069", input: "Tresemme", expectedCode: "b_1894", expectedLabel: "טרזמה", note: "Recall miss; duplicate allowed" },
  { id: "EN070", input: "Altman", expectedCode: "b_3423", expectedLabel: "אלטמן", note: "Retrieved, held at review" },
  { id: "EN071", input: "Sofix", expectedCode: "b_865", expectedLabel: "סופיקס", note: "Retrieved, held at review" },
  { id: "EN072", input: "Dorminol", expectedCode: "b_2807", expectedLabel: "דורמינול", note: "Retrieved, held at review" },
  { id: "EN073", input: "Aquilan", expectedCode: "b_707", expectedLabel: "אקילן", note: "Retrieved, held at review" },
  { id: "EN074", input: "Casting", expectedCode: "b_521", expectedLabel: "קסטינג", note: "Retrieved, held at review" },
  { id: "EN075", input: "Carly", expectedCode: "b_2162", expectedLabel: "קרלי", note: "Retrieved, held at review" },
  { id: "EN076", input: "Speedy", expectedCode: "b_1299", expectedLabel: "ספידי", note: "Retrieved, held at review" },
  { id: "EN077", input: "Flourish", expectedCode: "b_2019", expectedLabel: "פלוריש", note: "Retrieved, held at review" },
  { id: "EN078", input: "Melanie", expectedCode: "b_469", expectedLabel: "מלאני", note: "Retrieved, held at review" },
  { id: "EN079", input: "Africa", expectedCode: "b_1423", expectedLabel: "אפריקה", note: "Retrieved, held at review" },
  { id: "EN080", input: "Sunoclear", expectedCode: "b_3090", expectedLabel: "סנוקליר", note: "Retrieved, held at review" },
  { id: "EN081", input: "Zino", expectedCode: "b_189", expectedLabel: "זינו", note: "Retrieved, held at review" },
  { id: "EN082", input: "Supertos", expectedCode: "b_5931", expectedLabel: "סופרטוס", note: "Retrieved, held at review" },
  { id: "EN083", input: "Excite", expectedCode: "b_3182", expectedLabel: "אקסייט", note: "Retrieved, held at review" },
  { id: "EN084", input: "Mikosan", expectedCode: "b_2640", expectedLabel: "מיקוסן", note: "Retrieved, held at review" },
  { id: "EN085", input: "Sinoclear", expectedCode: "b_5402", expectedLabel: "סינוקליר", note: "Retrieved, held at review" },
  { id: "EN086", input: "Antikan", expectedCode: "b_826", expectedLabel: "אנתיקן", note: "Retrieved, held at review" },
  { id: "EN087", input: "Softvaki", expectedCode: "b_1009", expectedLabel: "סופטווקי", note: "Retrieved, held at review" },
  { id: "EN088", input: "Antimos", expectedCode: "b_4508", expectedLabel: "אנטימוס", note: "Retrieved, held at review" },
  { id: "EN089", input: "Blotrack", expectedCode: "b_4235", expectedLabel: "בלוטרק", note: "Retrieved, held at review" },
  { id: "EN090", input: "Lumbotrin", expectedCode: "b_4806", expectedLabel: "לומבוטרין", note: "Retrieved, held at review" },
  { id: "EN091", input: "Bactisidal", expectedCode: "b_1503", expectedLabel: "בקטיסידל", note: "Retrieved, held at review" },
  { id: "EN092", input: "Pasgor", expectedCode: "b_1562", expectedLabel: "פסגור", note: "Retrieved, held at review" },
  { id: "EN093", input: "Nevutim", expectedCode: "b_1034", expectedLabel: "נבוטים", note: "Retrieved, held at review" },
  { id: "EN094", input: "Siltzaa", expectedCode: "b_4385", expectedLabel: "סילצאה", note: "Retrieved, held at review" },
  { id: "EN095", input: "Decapinol", expectedCode: "b_4441", expectedLabel: "דקפינול", note: "Retrieved, held at review" },
  { id: "EN096", input: "Chokta", expectedCode: "b_1877", expectedLabel: "צ'וקטה", note: "Retrieved, held at review" },
  { id: "EN097", input: "Barcha", expectedCode: "b_4059", expectedLabel: "בארכה", note: "Retrieved, held at review" },
  { id: "EN098", input: "Kamboziun", expectedCode: "b_2239", expectedLabel: "קמבוציון", note: "Retrieved, held at review" },
  { id: "EN099", input: "Aromtzum", expectedCode: "b_4484", expectedLabel: "ארומצום", note: "Retrieved, held at review" },
  { id: "EN100", input: "Vitamult", expectedCode: "b_3559", expectedLabel: "ויטמולט", note: "Retrieved, held at review" },
  { id: "EN101", input: "Nicky", expectedCode: "b_758", expectedLabel: "ניקי", note: "Retrieved, held at review" },
  { id: "EN102", input: "Acne Derm", expectedCode: "b_1533", expectedLabel: "אקנה דרם", note: "Retrieved, held at review" },
  { id: "EN103", input: "Finn Crisp", expectedCode: "b_3059", expectedLabel: "פין קריספ", note: "Retrieved, held at review" },
  { id: "EN104", input: "Intimately Yours", expectedCode: "b_4971", expectedLabel: "אינטימייטלי יורס", note: "Retrieved, held at review" },
  { id: "EN105", input: "Vivi", expectedCode: "b_3648", expectedLabel: "ויוי", note: "Retrieved, held at review" },
  { id: "EN106", input: "Magnesium Diasporal", expectedCode: "b_4853", expectedLabel: "מגנזיום דיאספורל", note: "Retrieved, held at review" },
  { id: "EN107", input: "Derma Color", expectedCode: "b_896", expectedLabel: "דרמה קולור", note: "Retrieved, held at review" },
  { id: "EN108", input: "Dr Rodriguez", expectedCode: "b_2479", expectedLabel: "דר רודריגז", note: "Retrieved, held at review" },
  { id: "EN109", input: "Can Can", expectedCode: "b_1996", expectedLabel: "קאן קאן", note: "Retrieved, held at review" },
  { id: "EN110", input: "Londa Singles", expectedCode: "b_3637", expectedLabel: "לונדה סינגלס", note: "Retrieved, held at review" },
  { id: "EN111", input: "Healthy Food", expectedCode: "b_1595", expectedLabel: "הלתי פוד", note: "Retrieved, held at review" },
  { id: "EN112", input: "Lily", expectedCode: "b_229", expectedLabel: "לילי", note: "Retrieved, held at review" },
  { id: "EN113", input: "Good Sense", expectedCode: "b_3613", expectedLabel: "גוד סנס", note: "Retrieved, held at review" },
  { id: "EN114", input: "Chloe Intense", expectedCode: "b_5032", expectedLabel: "קלואה אינטנס", note: "Retrieved, held at review" },
  { id: "EN115", input: "Mariella Burani", expectedCode: "b_4313", expectedLabel: "מריאלה ברוני", note: "Retrieved, held at review" },
  { id: "EN116", input: "Bamba", expectedCode: "b_968", expectedLabel: "במבה", note: "Retrieved, held at review" },
  { id: "EN117", input: "Camera", expectedCode: "b_341", expectedLabel: "קמרה", note: "Retrieved, held at review" },
  { id: "EN118", input: "Escada Sentiment", expectedCode: "b_2264", expectedLabel: "אסקדה סנטימנט", note: "Retrieved, held at review" },
  { id: "EN119", input: "Aloe Active", expectedCode: "b_3787", expectedLabel: "אלו אקטיב", note: "Retrieved, held at review" },
  { id: "EN120", input: "Heart", expectedCode: "b_3640", expectedLabel: "הרט", note: "Retrieved, held at review" },
  { id: "EN121", input: "Provocative Interlude", expectedCode: "b_3880", expectedLabel: "פרווקטיב אינטרלוד", note: "Retrieved, held at review" },
  { id: "EN122", input: "Spa", expectedCode: "b_616", expectedLabel: "ספא", note: "Retrieved, held at review" },
  { id: "EN123", input: "Maxi Health", expectedCode: "b_2248", expectedLabel: "מקסי הלת", note: "Retrieved, held at review" },
  { id: "EN124", input: "Home Set", expectedCode: "b_5681", expectedLabel: "הום סט", note: "Retrieved, held at review" },
  { id: "EN125", input: "Wet & Wild", expectedCode: "b_4797", expectedLabel: "ווט&ווילד", note: "Retrieved, held at review" },
  { id: "EN126", input: "Crash", expectedCode: "b_916", expectedLabel: "קראש", note: "Retrieved, held at review" },
  { id: "EN127", input: "Euphoria Blossom", expectedCode: "b_4024", expectedLabel: "אופוריה בלוסום", note: "Retrieved, held at review" },
  { id: "EN128", input: "Dr Soldan", expectedCode: "b_2077", expectedLabel: "דר סולדן", note: "Retrieved, held at review" },
  { id: "EN129", input: "Sano Sun", expectedCode: "b_3870", expectedLabel: "סנו סאן", note: "Retrieved, held at review" },
  { id: "EN130", input: "Volupte", expectedCode: "b_201", expectedLabel: "וולופטה", note: "Retrieved, held at review" },
  { id: "EN131", input: "Livostin", expectedCode: "b_5531", expectedLabel: "ליבוסטין", note: "Retrieved, held at review" },
  { id: "EN132", input: "Zone Perfect", expectedCode: "b_1612", expectedLabel: "זון פרפקט", note: "Retrieved, held at review" },
  { id: "EN133", input: "Boom", expectedCode: "b_3527", expectedLabel: "בום", note: "Retrieved, held at review" },
  { id: "EN134", input: "Bio Pharm", expectedCode: "b_3456", expectedLabel: "ביו פארם", note: "Retrieved, held at review" },
  { id: "EN135", input: "Harry Potter", expectedCode: "b_3070", expectedLabel: "הארי פוטר", note: "Retrieved, held at review" },
  { id: "EN136", input: "Biocare", expectedCode: "b_2028", expectedLabel: "ביוקר", note: "Retrieved, held at review" },
  { id: "EN137", input: "Diesel Unlimited", expectedCode: "b_4316", expectedLabel: "דיזל אנלימיטד", note: "Retrieved, held at review" },
  { id: "EN138", input: "Creme Rinse", expectedCode: "b_528", expectedLabel: "קרם רינס", note: "Retrieved, held at review" },
  { id: "EN139", input: "Compeed", expectedCode: "b_3895", expectedLabel: "קומפיד", note: "Retrieved, held at review" },
  { id: "EN140", input: "Super Link", expectedCode: "b_1598", expectedLabel: "סופר לינק", note: "Retrieved, held at review" },
  { id: "EN141", input: "Modulus", expectedCode: "b_2178", expectedLabel: "מודולוס", note: "Retrieved, held at review" },
  { id: "EN142", input: "Handy Cellular", expectedCode: "b_4115", expectedLabel: "הנדי סלולר", note: "Retrieved, held at review" },
  { id: "EN143", input: "Truffles", expectedCode: "b_3159", expectedLabel: "טראפלס", note: "Retrieved, held at review" },
  { id: "EN144", input: "Dentix", expectedCode: "b_731", expectedLabel: "דנטיקס", note: "Retrieved, held at review" },
  { id: "EN145", input: "Oralmedic", expectedCode: "b_4290", expectedLabel: "אורלמדיק", note: "Retrieved, held at review" },
  { id: "EN146", input: "Creme Color", expectedCode: "b_527", expectedLabel: "קרם קולור", note: "Retrieved, held at review" },
  { id: "EN147", input: "Renew", expectedCode: "b_1464", expectedLabel: "ריניו", note: "Retrieved, held at review" },
  { id: "EN148", input: "Skin Guard", expectedCode: "b_2132", expectedLabel: "סקין גארד", note: "Retrieved, held at review" },
  { id: "EN149", input: "Dunhill Blue", expectedCode: "b_3443", expectedLabel: "דנהיל בלו", note: "Retrieved, held at review" },
  { id: "EN150", input: "Pepperidge", expectedCode: "b_1080", expectedLabel: "פפרידג", note: "Retrieved, held at review" },
  { id: "EN151", input: "Magic Retouch", expectedCode: "b_1952", expectedLabel: "מגי'ק ריטאצ'", note: "Retrieved, held at review" },
  { id: "EN152", input: "Soft Active", expectedCode: "b_658", expectedLabel: "סופט אקטיב", note: "Retrieved, held at review" },
  { id: "EN153", input: "Herbal Made", expectedCode: "b_3994", expectedLabel: "הרבל מייד", note: "Retrieved, held at review" },
  { id: "EN154", input: "Hill", expectedCode: "b_3966", expectedLabel: "היל", note: "Retrieved, held at review" },
  { id: "EN155", input: "Vice Versa", expectedCode: "b_60", expectedLabel: "וייס ורסה", note: "Retrieved, held at review" },
  { id: "EN156", input: "Sensi", expectedCode: "b_3315", expectedLabel: "סנסי", note: "Retrieved, held at review" },
  { id: "EN157", input: "Ethyl Chloride", expectedCode: "b_4876", expectedLabel: "אתיל כלוריד", note: "Retrieved, held at review" },
  { id: "EN158", input: "Aromatica", expectedCode: "b_1565", expectedLabel: "ארומטיקה", note: "Retrieved, held at review" },
  { id: "EN159", input: "Aqua Quorum", expectedCode: "b_429", expectedLabel: "אקווה קוורום", note: "Retrieved, held at review" },
  { id: "EN160", input: "Malt Star", expectedCode: "b_1101", expectedLabel: "מאלט סטאר", note: "Retrieved, held at review" },
  { id: "EN161", input: "Coca Cola", expectedCode: "b_1098", expectedLabel: "קוקה קולה", note: "Blocks today" },
  { id: "EN162", input: "Dentista", expectedCode: "b_4340", expectedLabel: "דנטיסטה", note: "Retrieved, held at review" },
  { id: "EN163", input: "Fast Test", expectedCode: "b_3492", expectedLabel: "פאסט טסט", note: "Retrieved, held at review" },
  { id: "EN164", input: "Palette", expectedCode: "b_3860", expectedLabel: "פאלטה", note: "Retrieved, held at review" },
  { id: "EN165", input: "So Inspired", expectedCode: "b_1274", expectedLabel: "סו אינספיירד", note: "Retrieved, held at review" },
  { id: "EN166", input: "Anhydrol", expectedCode: "b_4867", expectedLabel: "אנהידרול", note: "Retrieved, held at review" },
  { id: "EN167", input: "Mosquitosafe", expectedCode: "b_4510", expectedLabel: "מוסקיטוסייף", note: "Retrieved, held at review" },
  { id: "EN168", input: "Intimately", expectedCode: "b_4003", expectedLabel: "אינטימייטלי", note: "Retrieved, held at review" },
  { id: "EN169", input: "Minoxi", expectedCode: "b_3334", expectedLabel: "מינוקסי", note: "Retrieved, held at review" },
  { id: "EN170", input: "Balneum", expectedCode: "b_3299", expectedLabel: "בלנאום", note: "Retrieved, held at review" },
  { id: "EN171", input: "Martini Massage", expectedCode: "b_1242", expectedLabel: "מרטיני מסאז", note: "Retrieved, held at review" },
  { id: "EN172", input: "Ambi Pure", expectedCode: "b_3231", expectedLabel: "אמבי פיור", note: "Retrieved, held at review" },
  { id: "EN173", input: "Coldex", expectedCode: "b_3302", expectedLabel: "קולדקס", note: "Retrieved, held at review" },
  { id: "EN174", input: "Charmin", expectedCode: "b_2126", expectedLabel: "שרמין", note: "Retrieved, held at review" },
  { id: "EN175", input: "Preference Ombre", expectedCode: "b_1720", expectedLabel: "פרפרנס אומברה", note: "Retrieved, held at review" },
  { id: "EN176", input: "La Roche-Posay", expectedCode: "b_2779", expectedLabel: "לה רוש-פוזה", note: "Retrieved, held at review" },
  { id: "EN177", input: "Fresh Ones", expectedCode: "b_193", expectedLabel: "פרש וונס", note: "Retrieved, held at review" },
  { id: "EN178", input: "Lacroix", expectedCode: "b_1593", expectedLabel: "לקרואה", note: "Retrieved, held at review" },
  { id: "EN179", input: "Pro Shaver", expectedCode: "b_3908", expectedLabel: "פרו שייבר", note: "Retrieved, held at review" },
  { id: "EN180", input: "Fantasy Bloom", expectedCode: "b_2735", expectedLabel: "פנטזי בלום", note: "Retrieved, held at review" },
  { id: "EN181", input: "In Black", expectedCode: "b_3837", expectedLabel: "אין בלק", note: "Retrieved, held at review" },
  { id: "EN182", input: "Melody Pops", expectedCode: "b_1025", expectedLabel: "מלודי פופס", note: "Retrieved, held at review" },
  { id: "EN183", input: "Slim Drink", expectedCode: "b_4504", expectedLabel: "סלים דרינק", note: "Retrieved, held at review" },
  { id: "EN184", input: "Moschino Couture", expectedCode: "b_3583", expectedLabel: "מוסקינו קוטור", note: "Retrieved, held at review" },
  { id: "EN185", input: "Carline", expectedCode: "b_2776", expectedLabel: "קרליין", note: "Retrieved, held at review" },
  { id: "EN186", input: "Microlife", expectedCode: "b_2245", expectedLabel: "מיקרולייף", note: "Retrieved, held at review" },
  { id: "EN187", input: "Linex", expectedCode: "b_5353", expectedLabel: "ליינקס", note: "Retrieved, held at review" },
  { id: "EN188", input: "Femina", expectedCode: "b_607", expectedLabel: "פמינה", note: "Retrieved, held at review" },
  { id: "EN189", input: "Dylon", expectedCode: "b_941", expectedLabel: "דילון", note: "Retrieved, held at review" },
  { id: "EN190", input: "Popstar", expectedCode: "b_1406", expectedLabel: "פופסטאר", note: "Retrieved, held at review" },
  { id: "EN191", input: "Paraffin", expectedCode: "b_3515", expectedLabel: "פראפין", note: "Retrieved, held at review" },
  { id: "EN192", input: "Innocence", expectedCode: "b_1209", expectedLabel: "אינוסנס", note: "Retrieved, held at review" },
  { id: "EN193", input: "Amino", expectedCode: "b_2053", expectedLabel: "אמינו", note: "Retrieved, held at review" },
  { id: "EN194", input: "Color Clear", expectedCode: "b_2270", expectedLabel: "קולור קליר", note: "Retrieved, held at review" },
  { id: "EN195", input: "Pampers", expectedCode: "b_552", expectedLabel: "פמפרס", note: "Blocks today" },
  { id: "EN196", input: "Antistax", expectedCode: "b_1876", expectedLabel: "אנטיסטקס", note: "Retrieved, held at review" },
  { id: "EN197", input: "Rose Bourbon", expectedCode: "b_3749", expectedLabel: "רוז בורבון", note: "Retrieved, held at review" },
  { id: "EN198", input: "Domestos", expectedCode: "b_5183", expectedLabel: "דומסטוס", note: "Retrieved, held at review" },
  { id: "EN199", input: "Febreze", expectedCode: "b_1566", expectedLabel: "פאבריז", note: "Retrieved, held at review" },
  { id: "EN200", input: "Milka", expectedCode: "b_3609", expectedLabel: "מילקה", note: "Retrieved, held at review" },
];

/** Invented English names with no indexed counterpart. These guard against over-blocking. */
const negativeControls: ReadonlyArray<readonly [string, string]> = [
  ["EN-N01", "Orvexa"],
  ["EN-N02", "Zylora"],
  ["EN-N03", "Novaquill"],
  ["EN-N04", "Quorali"],
  ["EN-N05", "Praxelia"],
];

test("loads the complete English-to-Hebrew matrix", () => {
  assert.equal(brands.length, 17653);
  assert.equal(translationCases.length, 200);
  assert.equal(negativeControls.length, 5);
  assert.equal(new Set(translationCases.map((entry) => entry.input)).size, 200);
});

for (const translationCase of translationCases) {
  test(`${translationCase.id}: ${translationCase.input} -> ${translationCase.expectedLabel}`, () => {
    const result = checker.checkBrand(translationCase.input);
    const topFive = result.candidates.slice(0, 5);
    const match = topFive.find((candidate) => candidate.code === translationCase.expectedCode);

    // Recall first: when the decision gate is fixed, a retrieval regression must still report
    // as a retrieval failure rather than hiding behind the decision assertion below.
    assert.ok(
      match,
      `${translationCase.id}: expected ${translationCase.expectedCode} (${translationCase.expectedLabel}) in the top five, got ${
        topFive.map((candidate) => `${candidate.code} ${candidate.label}`).join(", ") || "no candidates"
      }`,
    );

    // BLOCK or HUMAN_REVIEW both count as catching the duplicate. Review puts the name in front of
    // a person, which is a correct outcome for a cross-script pairing resting on a generated
    // spelling; only ALLOW lets the duplicate through silently, and that is what this guards.
    assert.notEqual(
      result.decision,
      "ALLOW",
      `${translationCase.id}: an English spelling of an indexed Hebrew brand must not be allowed, got ${result.decision} (${translationCase.note})`,
    );

    assert.ok(match.reason, `${translationCase.id}: matching candidate must carry a reason`);
    assert.ok(
      match.crossLanguageSignals,
      `${translationCase.id}: matching candidate must carry cross-language signals`,
    );
  });
}

for (const [id, input] of negativeControls) {
  test(`${id}: ${input} is not a duplicate`, () => {
    const result = checker.checkBrand(input);
    assert.equal(result.decision, "ALLOW", `${id}: invented English name must not be blocked`);
  });
}
