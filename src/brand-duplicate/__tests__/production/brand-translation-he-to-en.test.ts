import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandResponse } from "../../brand-adapter.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import { BrandIndex } from "../../brand-index.js";

/**
 * Hebrew input against an English-labelled brand.
 *
 * A Hebrew spelling of an indexed English brand is a duplicate, and the suite asserts it is not
 * silently allowed: BLOCK and HUMAN_REVIEW both pass, ALLOW fails. Review is a correct outcome
 * here rather than a shortfall — these pairings rest on a generated spelling, and putting such a
 * name in front of a person is what the review state is for. Only ALLOW creates the duplicate.
 *
 * With one exception, every input here is absent from the catalogue as written, so each case
 * exercises the cross-language path rather than matching a Hebrew entry that already exists. The
 * exception is ג'ילט (HE030): the catalogue also holds it verbatim as b_680, so it blocks on that
 * same-script entry, and the case asserts that the Latin brand still surfaces beside it. Every
 * expected code was verified against response.json.
 *
 * Two cases were removed as out of scope: this is duplicate detection, not inference. פאקו/Paco
 * is a different word from its brand's label (Rabanne), and הילפיגר טומי pairs a two-word input
 * against the one-word HILFIGER. Neither is a transliteration of the name it was expected to
 * reach, so neither can be settled by comparing spellings.
 *
 * See docs/manual-tests/hebrew-to-english-test-cases.md for the status table and root cause.
 */
type TranslationCase = {
  id: string;
  input: string;
  expectedCode: string;
  expectedLabel: string;
  note: string;
  /**
   * Other catalogue brands that render the input exactly as faithfully as the expected one. When
   * several brands share a spelling, which of them lands in the top five is a tie no rule can
   * settle, and any of them surfaces the duplicate for review.
   */
  equivalentCodes?: readonly string[];
};

const responsePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../response.json");
const response = JSON.parse(await readFile(responsePath, "utf8")) as unknown;
const brands = parseBrandResponse(response);
const checker = new BrandDuplicateChecker(new BrandIndex(brands));

const translationCases: TranslationCase[] = [
  { id: "HE001", input: "אדידס", expectedCode: "b_3453", expectedLabel: "Adidas", note: "Blocks today" },
  { id: "HE002", input: "נייקי", expectedCode: "b_3051", expectedLabel: "NIKE", note: "Blocks today" },
  { id: "HE003", input: "לוריאל", expectedCode: "b_13982mp", expectedLabel: "LOREAL", note: "Blocks today" },
  { id: "HE004", input: "ז'יבנשי", expectedCode: "b_5", expectedLabel: "GIVENCHY", note: "Blocks today" },
  { id: "HE005", input: "ניוטרוג'ינה", expectedCode: "b_33", expectedLabel: "NEUTROGENA ", note: "Blocks today" },
  { id: "HE006", input: "שאנל", expectedCode: "b_7", expectedLabel: "CHANEL", note: "Retrieved, held at review" },
  { id: "HE007", input: "קנזו", expectedCode: "b_237", expectedLabel: "Kenzo", note: "Retrieved, held at review" },
  { id: "HE008", input: "דיזל", expectedCode: "b_1978", expectedLabel: "DIESEL", note: "Retrieved, held at review" },
  { id: "HE009", input: "ניוואה", expectedCode: "b_386", expectedLabel: "NIVEA", note: "Retrieved, held at review" },
  { id: "HE010", input: "גוצי", expectedCode: "b_4480", expectedLabel: "GUCCI", note: "Retrieved, held at review" },
  { id: "HE011", input: "ורסאצה", expectedCode: "b_104", expectedLabel: "VERSACE", note: "Retrieved, held at review" },
  { id: "HE012", input: "בולגרי", expectedCode: "b_1278", expectedLabel: "BVLGARI", note: "Retrieved, held at review" },
  { id: "HE013", input: "ארמני", expectedCode: "b_93", expectedLabel: "armani", note: "Retrieved, held at review" },
  { id: "HE014", input: "דיאור", expectedCode: "b_4463", expectedLabel: "DIOR", note: "Retrieved, held at review" },
  { id: "HE015", input: "פומה", expectedCode: "b_8747mp", expectedLabel: "POMA", note: "Retrieved, held at review" },
  { id: "HE016", input: "ויאגרה", expectedCode: "b_11666mp", expectedLabel: "VGR", note: "Retrieved, held at review" },
  { id: "HE017", input: "גרנייה", expectedCode: "b_3945", expectedLabel: "GARNIER", note: "Recall miss" },
  { id: "HE018", input: "רבלון", expectedCode: "b_48", expectedLabel: "REVLON", note: "Recall miss" },
  { id: "HE019", input: "מייבלין", expectedCode: "b_881", expectedLabel: "MAYBELLINE", note: "Recall miss" },
  { id: "HE020", input: "לנקום", expectedCode: "b_20", expectedLabel: "LANCOME", note: "Recall miss; duplicate allowed" },
  { id: "HE021", input: "קליניק", expectedCode: "b_1", expectedLabel: "CLINIQUE", note: "Recall miss" },
  { id: "HE022", input: "וישי", expectedCode: "b_22", expectedLabel: "VICHY", note: "Retrieved, held at review" },
  { id: "HE023", input: "שיסיידו", expectedCode: "b_1973", expectedLabel: "SHISEIDO", note: "Retrieved, held at review" },
  { id: "HE024", input: "לקוסט", expectedCode: "b_85", expectedLabel: "LACOSTE", note: "Recall miss" },
  { id: "HE025", input: "פראדה", expectedCode: "b_4465", expectedLabel: "PRADA", note: "Retrieved, held at review" },
  { id: "HE026", input: "מושינו", expectedCode: "b_446", expectedLabel: "MOSCHINO", note: "Recall miss" },
  { id: "HE027", input: "טרוסארדי", expectedCode: "b_76", expectedLabel: "TRUSSARDI", note: "Retrieved, held at review" },
  { id: "HE028", input: "מיסוני", expectedCode: "b_2616", expectedLabel: "MISSONI", note: "Retrieved, held at review" },
  { id: "HE029", input: "ברברי", expectedCode: "b_2294", expectedLabel: "BURBERRY", note: "Recall miss" },
  { id: "HE030", input: "ג'ילט", expectedCode: "b_13705mp", expectedLabel: "GILLETTE", note: "Recall miss" },
  { id: "HE031", input: "פאיו", expectedCode: "b_11", expectedLabel: "PAYOT", note: "Recall miss" },
  { id: "HE032", input: "דקלאור", expectedCode: "b_55", expectedLabel: "DECLEOR", note: "Recall miss" },
  { id: "HE033", input: "קודלי", expectedCode: "b_13412mp", expectedLabel: "CAUDALIE", note: "Recall miss" },
  { id: "HE034", input: "ניאוסטרטה", expectedCode: "b_8631mp", expectedLabel: "Neostrata", note: "Retrieved, held at review" },
  { id: "HE035", input: "אופוריה", expectedCode: "b_3851", expectedLabel: "EUPHORIA", note: "Retrieved, held at review" },
  { id: "HE036", input: "מונטל", expectedCode: "b_5176", expectedLabel: "MONTALE", note: "Retrieved, held at review" },
  { id: "HE037", input: "הילפיגר", expectedCode: "b_4357", expectedLabel: "HILFIGER", note: "Recall miss; duplicate allowed" },
  { id: "HE038", input: "קשרל", expectedCode: "b_2704", expectedLabel: "cacharel", note: "Recall miss" },
  { id: "HE039", input: "אזארו", expectedCode: "b_103", expectedLabel: "AZZARO", note: "Retrieved, held at review" },
  { id: "HE040", input: "בלמיין", expectedCode: "b_3589", expectedLabel: "BALMAIN", note: "Recall miss; duplicate allowed" },
  { id: "HE041", input: "דולצ'ה", expectedCode: "b_1773", expectedLabel: "DOLCE", note: "Retrieved, held at review" },
  { id: "HE042", input: "מוגלר", expectedCode: "b_2699", expectedLabel: "mugler", note: "Retrieved, held at review" },
  // ו reads as "o" or "u" and the doubled m is one sound, so TOMMY, TOMY, Tomi, Tommi and TUMI are
  // all the same Hebrew spelling.
  {
    id: "HE043",
    input: "טומי",
    expectedCode: "b_1231",
    expectedLabel: "TOMMY",
    note: "Recall miss",
    equivalentCodes: ["b_6065mp", "b_7208mp", "b_9996mp", "b_6822"],
  },
  { id: "HE044", input: "רבאן", expectedCode: "b_183", expectedLabel: "Rabanne", note: "Recall miss" },
  { id: "HE045", input: "קלרינס", expectedCode: "b_15", expectedLabel: "CLARINS", note: "Recall miss; duplicate allowed" },
  { id: "HE046", input: "קריד", expectedCode: "b_5737", expectedLabel: "CREED", note: "Recall miss; duplicate allowed" },
  { id: "HE047", input: "גרלן", expectedCode: "b_1185", expectedLabel: "GUERLAIN", note: "Recall miss" },
  { id: "HE048", input: "סיסלי", expectedCode: "b_52", expectedLabel: "sisley", note: "Retrieved, held at review" },
  { id: "HE049", input: "אסתי", expectedCode: "b_121", expectedLabel: "ESTEE", note: "Retrieved, held at review" },
  { id: "HE050", input: "אסקדה", expectedCode: "b_198", expectedLabel: "Escada", note: "Recall miss" },
  { id: "HE051", input: "רושא", expectedCode: "b_40", expectedLabel: "ROCHAS", note: "Retrieved, held at review" },
  { id: "HE052", input: "קלואה", expectedCode: "b_137", expectedLabel: "Chloe", note: "Recall miss" },
  { id: "HE053", input: "קואץ", expectedCode: "b_1903", expectedLabel: "COACH", note: "Recall miss" },
  { id: "HE054", input: "קסרגוף", expectedCode: "b_5833", expectedLabel: "XERJOFF", note: "Recall miss; duplicate allowed" },
  { id: "HE055", input: "ביירדו", expectedCode: "b_6072", expectedLabel: "BYREDO", note: "Recall miss" },
  { id: "HE056", input: "גוטאל", expectedCode: "b_6088", expectedLabel: "GOUTAL", note: "Retrieved, held at review" },
  { id: "HE057", input: "לואבה", expectedCode: "b_6618", expectedLabel: "LOEWE", note: "Recall miss" },
  { id: "HE058", input: "דיפטיק", expectedCode: "b_8780mp", expectedLabel: "Diptyque", note: "Retrieved, held at review" },
  { id: "HE059", input: "אמואג", expectedCode: "b_8781mp", expectedLabel: "Amouage", note: "Recall miss" },
  { id: "HE060", input: "צ'רוטי", expectedCode: "b_9840mp", expectedLabel: "Cerruti", note: "Recall miss; duplicate allowed" },
  { id: "HE061", input: "ליברה", expectedCode: "b_5413", expectedLabel: "LIBRE", note: "Retrieved, held at review" },
  { id: "HE062", input: "סטארס", expectedCode: "b_5293", expectedLabel: "STARS", note: "Retrieved, held at review" },
  { id: "HE063", input: "שיר", expectedCode: "b_5230", expectedLabel: "SHEER", note: "Retrieved, held at review" },
  { id: "HE064", input: "קונברס", expectedCode: "b_2527", expectedLabel: "CONVERSE", note: "Recall miss; duplicate allowed" },
  { id: "HE065", input: "טימברלנד", expectedCode: "b_2329", expectedLabel: "TIMBERLAND", note: "Retrieved, held at review" },
  { id: "HE066", input: "זייס", expectedCode: "b_5731", expectedLabel: "ZEISS", note: "Recall miss" },
  { id: "HE067", input: "אוקלי", expectedCode: "b_2312", expectedLabel: "OAKLEY", note: "Recall miss" },
  { id: "HE068", input: "פולארויד", expectedCode: "b_6707", expectedLabel: "POLAROID", note: "Retrieved, held at review" },
  { id: "HE069", input: "קולומביה", expectedCode: "b_5906mp", expectedLabel: "Columbia", note: "Recall miss" },
  { id: "HE070", input: "קררה", expectedCode: "b_6012mp", expectedLabel: "Carrera", note: "Recall miss; duplicate allowed" },
  { id: "HE071", input: "דנלופ", expectedCode: "b_6161mp", expectedLabel: "Dunlop", note: "Recall miss; duplicate allowed" },
  { id: "HE072", input: "מיזונו", expectedCode: "b_6749mp", expectedLabel: "Mizuno", note: "Retrieved, held at review" },
  { id: "HE073", input: "ברוקס", expectedCode: "b_6829mp", expectedLabel: "Brooks", note: "Retrieved, held at review" },
  { id: "HE074", input: "סלומון", expectedCode: "b_6840mp", expectedLabel: "Salomon", note: "Recall miss" },
  { id: "HE075", input: "וילסון", expectedCode: "b_6939mp", expectedLabel: "Wilson", note: "Retrieved, held at review" },
  { id: "HE076", input: "אסיקס", expectedCode: "b_6944mp", expectedLabel: "Asics", note: "Retrieved, held at review" },
  { id: "HE077", input: "סאקוני", expectedCode: "b_6943mp", expectedLabel: "Saucony", note: "Recall miss" },
  { id: "HE078", input: "מירל", expectedCode: "b_6980mp", expectedLabel: "Merrell", note: "Recall miss" },
  { id: "HE079", input: "סקצרס", expectedCode: "b_7339mp", expectedLabel: "SKECHERS", note: "Recall miss; duplicate allowed" },
  { id: "HE080", input: "קרוקס", expectedCode: "b_8802mp", expectedLabel: "Crocs", note: "Recall miss" },
  { id: "HE081", input: "סמית", expectedCode: "b_9010mp", expectedLabel: "Smith", note: "Retrieved, held at review" },
  { id: "HE082", input: "סלזנגר", expectedCode: "b_9436mp", expectedLabel: "Slazenger", note: "Retrieved, held at review" },
  { id: "HE083", input: "בירקנשטוק", expectedCode: "b_9574mp", expectedLabel: "Birkenstock", note: "Retrieved, held at review" },
  { id: "HE084", input: "וורטה", expectedCode: "b_6915", expectedLabel: "VERTE", note: "Retrieved, held at review" },
  { id: "HE085", input: "רושאס", expectedCode: "b_40", expectedLabel: "ROCHAS", note: "Retrieved, held at review" },
  { id: "HE086", input: "אסטה", expectedCode: "b_121", expectedLabel: "ESTEE", note: "Retrieved, held at review" },
  { id: "HE087", input: "סיסליי", expectedCode: "b_52", expectedLabel: "sisley", note: "Retrieved, held at review" },
  { id: "HE088", input: "גרלין", expectedCode: "b_1185", expectedLabel: "GUERLAIN", note: "Recall miss" },
  { id: "HE089", input: "קרייד", expectedCode: "b_5737", expectedLabel: "CREED", note: "Recall miss" },
  // א carries any vowel and GUESS writes a silent u, so גאס spells GAS letter for letter and GUESS
  // by sound; both are faithful readings of it.
  {
    id: "HE090",
    input: "גאס",
    expectedCode: "b_1962",
    expectedLabel: "GUESS",
    note: "Recall miss",
    equivalentCodes: ["b_6151mp"],
  },
  { id: "HE092", input: "מוגלה", expectedCode: "b_2699", expectedLabel: "mugler", note: "Retrieved, held at review" },
  { id: "HE093", input: "דולצה", expectedCode: "b_1773", expectedLabel: "DOLCE", note: "Retrieved, held at review" },
  { id: "HE094", input: "פרוטאין", expectedCode: "b_6319", expectedLabel: "PROTEIN", note: "Blocks today" },
  { id: "HE095", input: "אזרו", expectedCode: "b_103", expectedLabel: "AZZARO", note: "Recall miss" },
  { id: "HE096", input: "קצרל", expectedCode: "b_2704", expectedLabel: "cacharel", note: "Recall miss; duplicate allowed" },
  { id: "HE098", input: "מונטאל", expectedCode: "b_5176", expectedLabel: "MONTALE", note: "Retrieved, held at review" },
  { id: "HE099", input: "לואווה", expectedCode: "b_6618", expectedLabel: "LOEWE", note: "Recall miss" },
  { id: "HE100", input: "מריל", expectedCode: "b_6980mp", expectedLabel: "Merrell", note: "Recall miss; duplicate allowed" },
  // Multi-word names are matched word by word. Before that, טומי הילפיגר was ALLOWED at 0.37 and
  // דאון טאון at 0.68, both reported from real use.
  { id: "HE101", input: "טומי הילפיגר", expectedCode: "b_2311", expectedLabel: "TOMMY HILFIGER", note: "Reported: was allowed" },
  { id: "HE102", input: "דאון טאון", expectedCode: "b_1716", expectedLabel: "DOWN TOWN", note: "Reported: was allowed" },
  { id: "HE103", input: "קלווין קליין", expectedCode: "b_1577", expectedLabel: "Calvin Klein", note: "Multi-word" },
  { id: "HE104", input: "ג'ורג'יו ארמני", expectedCode: "b_1958", expectedLabel: "GIORGIO ARMANI", note: "Blocks today" },
  { id: "HE105", input: "בוורלי הילס", expectedCode: "b_2334", expectedLabel: "BEVERLY HILLS", note: "Retrieved, held at review" },
  { id: "HE106", input: "מודרן מיוז", expectedCode: "b_1834", expectedLabel: "Modern Muse", note: "Retrieved, held at review" },
  { id: "HE107", input: "נוטרמיג'ן", expectedCode: "b_5649", expectedLabel: "NUTRAMIGEN", note: "Retrieved, held at review" },
  { id: "HE108", input: "טווילי", expectedCode: "b_5758", expectedLabel: "TWILLY", note: "Retrieved, held at review" },
  { id: "HE109", input: "זיפו", expectedCode: "b_5048", expectedLabel: "ZIPPO", note: "Retrieved, held at review" },
  { id: "HE110", input: "סופלנס", expectedCode: "b_6042", expectedLabel: "Soflens", note: "Retrieved, held at review" },
  { id: "HE111", input: "טוויסטשייק", expectedCode: "b_5547", expectedLabel: "TWISTSHAKE", note: "Retrieved, held at review" },
  { id: "HE112", input: "מדונה", expectedCode: "b_3297", expectedLabel: "MADONNA", note: "Retrieved, held at review" },
  { id: "HE113", input: "שביניון", expectedCode: "b_366", expectedLabel: "CHEVIGNON", note: "Retrieved, held at review" },
  { id: "HE114", input: "ריברה", expectedCode: "b_1517", expectedLabel: "RIVERA", note: "Retrieved, held at review" },
  { id: "HE115", input: "גרמין", expectedCode: "b_562", expectedLabel: "GARMIN", note: "Retrieved, held at review" },
  { id: "HE116", input: "לה פריירי", expectedCode: "b_1228", expectedLabel: "la prairie", note: "Retrieved, held at review" },
  // AVANT GARDE is catalogued twice, and Hebrew writes the French loanword as one word.
  {
    id: "HE117",
    input: "אוונגרד",
    expectedCode: "b_5263",
    expectedLabel: "AVANT GARDE",
    note: "Recall miss; duplicate allowed",
    equivalentCodes: ["b_2428"],
  },
  { id: "HE118", input: "ריפליי", expectedCode: "b_2327", expectedLabel: "REPLAY", note: "Retrieved, held at review" },
  { id: "HE119", input: "ארמיס", expectedCode: "b_62", expectedLabel: "Aramis", note: "Retrieved, held at review" },
  { id: "HE120", input: "בייבי איינשטיין", expectedCode: "b_4270", expectedLabel: "BABY EINSTEIN", note: "Retrieved, held at review" },
  { id: "HE121", input: "ג'וסי קוטור", expectedCode: "b_4403", expectedLabel: "JUICY COUTURE", note: "Retrieved, held at review" },
  { id: "HE122", input: "ביי טרי", expectedCode: "b_1886", expectedLabel: "BY TERRY", note: "Retrieved, held at review" },
  { id: "HE123", input: "אלאיה", expectedCode: "b_1871", expectedLabel: "ALAIA", note: "Retrieved, held at review" },
  { id: "HE124", input: "פיקסי", expectedCode: "b_5173", expectedLabel: "PIXI", note: "Retrieved, held at review" },
  { id: "HE125", input: "פורלה", expectedCode: "b_2309", expectedLabel: "FURLA", note: "Retrieved, held at review" },
  { id: "HE126", input: "אמבריוליס", expectedCode: "b_5422", expectedLabel: "EMBRYOLISSE", note: "Retrieved, held at review" },
  { id: "HE127", input: "אוויאן", expectedCode: "b_2814", expectedLabel: "EVIAN", note: "Blocks today" },
  { id: "HE128", input: "דייויד בקהאם", expectedCode: "b_3862", expectedLabel: "DAVID BECKHAM", note: "Retrieved, held at review" },
  { id: "HE129", input: "סיסטמה", expectedCode: "b_5647", expectedLabel: "SISTEMA", note: "Retrieved, held at review" },
  { id: "HE130", input: "מון בלאן", expectedCode: "b_2700", expectedLabel: "MONT BLANC", note: "Retrieved, held at review" },
  { id: "HE131", input: "טרוביה", expectedCode: "b_5544", expectedLabel: "truvia", note: "Retrieved, held at review" },
  { id: "HE132", input: "לוג'יטק", expectedCode: "b_4560", expectedLabel: "LOGITECH", note: "Retrieved, held at review" },
  { id: "HE133", input: "אמיליו פוצ'י", expectedCode: "b_2335", expectedLabel: "EMILIO PUCCI", note: "Retrieved, held at review" },
  { id: "HE134", input: "ג'אברה", expectedCode: "b_2243", expectedLabel: "JABRA", note: "Retrieved, held at review" },
  // DUNHILL is catalogued twice. The Hebrew דנהיל בלו ranks first as a same-script extension of the
  // input, which is not this duplicate.
  {
    id: "HE135",
    input: "דנהיל",
    expectedCode: "b_2315",
    expectedLabel: "DUNHILL",
    note: "Recall miss",
    equivalentCodes: ["b_1457"],
  },
  { id: "HE136", input: "ביורר", expectedCode: "b_5432", expectedLabel: "Beurer", note: "Retrieved, held at review" },
  { id: "HE137", input: "ג'סיקה סימפסון", expectedCode: "b_2500", expectedLabel: "JESSICA SIMPSON", note: "Retrieved, held at review" },
  { id: "HE138", input: "גלאמגלואו", expectedCode: "b_5148", expectedLabel: "GLAMGLOW", note: "Retrieved, held at review" },
  { id: "HE139", input: "ארמנג'ילדו זגנה", expectedCode: "b_3928", expectedLabel: "Ermenegildo Zegna", note: "Retrieved, held at review" },
  { id: "HE140", input: "מונקאפ", expectedCode: "b_5691", expectedLabel: "mooncup", note: "Retrieved, held at review" },
  { id: "HE141", input: "אלי סאאב", expectedCode: "b_5740", expectedLabel: "ELIE SAAB", note: "Retrieved, held at review" },
  { id: "HE142", input: "ריהאנה", expectedCode: "b_2708", expectedLabel: "Rihanna", note: "Retrieved, held at review" },
  { id: "HE143", input: "רימל לונדון", expectedCode: "b_2169", expectedLabel: "RIMMEL LONDON", note: "Retrieved, held at review" },
  { id: "HE144", input: "רמינגטון", expectedCode: "b_5191", expectedLabel: "REMINGTON", note: "Retrieved, held at review" },
  { id: "HE145", input: "סמסונג", expectedCode: "b_2246", expectedLabel: "SAMSUNG", note: "Blocks today" },
  { id: "HE146", input: "פאוורייד", expectedCode: "b_5204", expectedLabel: "POWERADE", note: "Retrieved, held at review" },
  { id: "HE147", input: "שון מנדס", expectedCode: "b_2905", expectedLabel: "SHAWN MENDES", note: "Retrieved, held at review" },
  { id: "HE148", input: "בננה ריפבליק", expectedCode: "b_4260", expectedLabel: "BANANA REPUBLIC", note: "Retrieved, held at review" },
  { id: "HE149", input: "קונטיגו", expectedCode: "b_5525", expectedLabel: "CONTIGO", note: "Retrieved, held at review" },
  { id: "HE150", input: "אנטוניו בנדרס", expectedCode: "b_1957", expectedLabel: "ANTONIO BANDERAS", note: "Retrieved, held at review" },
  { id: "HE151", input: "הוגו בוס", expectedCode: "b_2094", expectedLabel: "HUGO BOSS", note: "Blocks today" },
  { id: "HE152", input: "פופה", expectedCode: "b_30", expectedLabel: "PUPA", note: "Retrieved, held at review" },
  { id: "HE153", input: "פאקונבל", expectedCode: "b_5968", expectedLabel: "FACONNABLE", note: "Retrieved, held at review" },
  { id: "HE154", input: "טום פורד", expectedCode: "b_2799", expectedLabel: "TOM FORD", note: "Retrieved, held at review" },
  { id: "HE155", input: "טד לפידוס", expectedCode: "b_226", expectedLabel: "TED LAPIDUS", note: "Retrieved, held at review" },
  { id: "HE156", input: "מקס פקטור", expectedCode: "b_16", expectedLabel: "MAX FACTOR", note: "Blocks today" },
  { id: "HE157", input: "לנבן", expectedCode: "b_177", expectedLabel: "LANVIN", note: "Retrieved, held at review" },
  { id: "HE158", input: "פלאוורבומב", expectedCode: "b_1639", expectedLabel: "FLOWERBOMB", note: "Retrieved, held at review" },
  { id: "HE159", input: "ננובבה", expectedCode: "b_2979", expectedLabel: "NANOBEBE", note: "Retrieved, held at review" },
  { id: "HE160", input: "טוני מולי", expectedCode: "b_5220", expectedLabel: "TONYMOLY", note: "Retrieved, held at review" },
  { id: "HE161", input: "איסי מיאקי", expectedCode: "b_218", expectedLabel: "Issey Miyake", note: "Retrieved, held at review" },
  { id: "HE162", input: "אולאי", expectedCode: "b_5562", expectedLabel: "OLAY", note: "Retrieved, held at review" },
  { id: "HE163", input: "ויסקאס", expectedCode: "b_1142", expectedLabel: "WHISKAS", note: "Retrieved, held at review" },
  { id: "HE164", input: "מונסטר אנרג'י", expectedCode: "b_5588", expectedLabel: "MONSTER ENERGY", note: "Retrieved, held at review" },
  { id: "HE165", input: "אקיוביו", expectedCode: "b_5957", expectedLabel: "ACUVUE", note: "Recall miss; duplicate allowed" },
  { id: "HE166", input: "ליידי גאגא", expectedCode: "b_3296", expectedLabel: "LADY GAGA", note: "Retrieved, held at review" },
  { id: "HE167", input: "איסאטיס", expectedCode: "b_124", expectedLabel: "YSATIS", note: "Retrieved, held at review" },
  { id: "HE168", input: "טי פי לינק", expectedCode: "b_4744", expectedLabel: "TP LINK", note: "Blocks today" },
  { id: "HE169", input: "ביו אויל", expectedCode: "b_2502", expectedLabel: "Bio-Oil", note: "Retrieved, held at review" },
  { id: "HE170", input: "יובנה", expectedCode: "b_29", expectedLabel: "JUVENA", note: "Retrieved, held at review" },
  { id: "HE171", input: "מקלארן", expectedCode: "b_5459", expectedLabel: "MACLAREN", note: "Retrieved, held at review" },
  { id: "HE172", input: "אליזבת טיילור", expectedCode: "b_2837", expectedLabel: "ELIZABETH TAYLOR", note: "Retrieved, held at review" },
  { id: "HE173", input: "נף נף", expectedCode: "b_4086", expectedLabel: "NAFNAF", note: "Retrieved, held at review" },
  { id: "HE174", input: "דל מונטה", expectedCode: "b_5349", expectedLabel: "Del Monte", note: "Retrieved, held at review" },
  { id: "HE175", input: "ג'ון ורבטוס", expectedCode: "b_4266", expectedLabel: "john varvatos", note: "Retrieved, held at review" },
  { id: "HE176", input: "קייטי פרי", expectedCode: "b_2705", expectedLabel: "KATY PERRY", note: "Retrieved, held at review" },
  { id: "HE177", input: "יוג'י ימאמוטו", expectedCode: "b_2093", expectedLabel: "Yohji Yamamoto", note: "Retrieved, held at review" },
  { id: "HE178", input: "ניקי מינאז'", expectedCode: "b_2701", expectedLabel: "NICKI MINAJ", note: "Retrieved, held at review" },
  { id: "HE179", input: "מדאם גרה", expectedCode: "b_1698", expectedLabel: "MADAME GRES", note: "Retrieved, held at review" },
  { id: "HE180", input: "אתניה ברצלונה", expectedCode: "b_5600", expectedLabel: "ETNIA BARCELONA", note: "Retrieved, held at review" },
  { id: "HE181", input: "אנאיס אנאיס", expectedCode: "b_249", expectedLabel: "Anais Anais", note: "Retrieved, held at review" },
  // CRISTIANO RONALDO is catalogued twice.
  {
    id: "HE182",
    input: "כריסטיאנו רונאלדו",
    expectedCode: "b_2888",
    expectedLabel: "CRISTIANO RONALDO",
    note: "Retrieved, held at review",
    equivalentCodes: ["b_2641"],
  },
  { id: "HE183", input: "לופו", expectedCode: "b_6706", expectedLabel: "LUPO", note: "Retrieved, held at review" },
  { id: "HE184", input: "ג'ימי צ'ו", expectedCode: "b_5067", expectedLabel: "JIMMY CHOO", note: "Retrieved, held at review" },
  { id: "HE185", input: "שאקירה", expectedCode: "b_2441", expectedLabel: "SHAKIRA", note: "Retrieved, held at review" },
  { id: "HE186", input: "אריאנה גרנדה", expectedCode: "b_5746", expectedLabel: "ARIANA GRANDE", note: "Retrieved, held at review" },
  { id: "HE187", input: "לוליטה למפיקה", expectedCode: "b_1507", expectedLabel: "Lolita Lempicka", note: "Retrieved, held at review" },
  { id: "HE188", input: "אילי", expectedCode: "b_4241", expectedLabel: "illy", note: "Retrieved, held at review" },
  { id: "HE189", input: "אינטקס", expectedCode: "b_2974", expectedLabel: "INTEX", note: "Retrieved, held at review" },
  { id: "HE190", input: "פלנטרוניקס", expectedCode: "b_4732", expectedLabel: "PLANTRONICS", note: "Retrieved, held at review" },
  { id: "HE191", input: "בובי בראון", expectedCode: "b_2999", expectedLabel: "BOBBI BROWN", note: "Retrieved, held at review" },
  { id: "HE192", input: "פדיגרי", expectedCode: "b_1150", expectedLabel: "PEDIGREE", note: "Retrieved, held at review" },
  { id: "HE193", input: "בראון", expectedCode: "b_652", expectedLabel: "BRAUN", note: "Blocks today" },
  { id: "HE194", input: "לוקסיטן", expectedCode: "b_3077", expectedLabel: "L'OCCITANE", note: "Retrieved, held at review" },
  { id: "HE195", input: "קילס", expectedCode: "b_5664", expectedLabel: "KIEHL'S", note: "Retrieved, held at review" },
  { id: "HE196", input: "אמריז'", expectedCode: "b_123", expectedLabel: "AMARIGE", note: "Retrieved, held at review" },
  { id: "HE197", input: "יארדלי", expectedCode: "b_5716", expectedLabel: "YARDLEY", note: "Retrieved, held at review" },
  { id: "HE198", input: "אסתי לאודר", expectedCode: "b_2", expectedLabel: "ESTEE LAUDER", note: "Blocks today" },
  { id: "HE199", input: "ז'אק בוגרט", expectedCode: "b_227", expectedLabel: "JACQUES BOGART", note: "Recall miss; duplicate allowed" },
  { id: "HE200", input: "לאורה ביאג'וטי", expectedCode: "b_5114", expectedLabel: "LAURA BIAGIOTTI", note: "Retrieved, held at review" },
  { id: "HE201", input: "קנווד", expectedCode: "b_4147", expectedLabel: "KENWOOD", note: "Retrieved, held at review" },
  { id: "HE202", input: "סמסרה", expectedCode: "b_433", expectedLabel: "SAMSARA", note: "Retrieved, held at review" },
];

/** Invented Hebrew names with no indexed counterpart. These guard against over-blocking. */
const negativeControls: ReadonlyArray<readonly [string, string]> = [
  ["HE-N01", "אורבקסה"],
  ["HE-N02", "ולמורה"],
  ["HE-N03", "קוורלי"],
  ["HE-N04", "פרקסליה"],
  ["HE-N05", "זילורה"],
];

test("loads the complete Hebrew-to-English matrix", () => {
  assert.equal(brands.length, 17653);
  assert.equal(translationCases.length, 200);
  assert.equal(negativeControls.length, 5);
  assert.equal(new Set(translationCases.map((entry) => entry.input)).size, 200);
});

for (const translationCase of translationCases) {
  test(`${translationCase.id}: ${translationCase.input} -> ${translationCase.expectedLabel}`, () => {
    const result = checker.checkBrand(translationCase.input);
    const topFive = result.candidates.slice(0, 5);
    const acceptedCodes = new Set([translationCase.expectedCode, ...(translationCase.equivalentCodes ?? [])]);
    const match = topFive.find((candidate) => acceptedCodes.has(candidate.code));

    // Recall first: when the decision gate is fixed, a retrieval regression must still report
    // as a retrieval failure rather than hiding behind the decision assertion below.
    assert.ok(
      match,
      `${translationCase.id}: expected ${[...acceptedCodes].join(" or ")} (${translationCase.expectedLabel}) in the top five, got ${
        topFive.map((candidate) => `${candidate.code} ${candidate.label}`).join(", ") || "no candidates"
      }`,
    );

    // BLOCK or HUMAN_REVIEW both count as catching the duplicate. Review puts the name in front of
    // a person, which is a correct outcome for a cross-script pairing resting on a generated
    // spelling; only ALLOW lets the duplicate through silently, and that is what this guards.
    assert.notEqual(
      result.decision,
      "ALLOW",
      `${translationCase.id}: a Hebrew spelling of an indexed English brand must not be allowed, got ${result.decision} (${translationCase.note})`,
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
    assert.notEqual(result.decision, "BLOCK", `${id}: invented Hebrew name must not be blocked`);
  });
}
