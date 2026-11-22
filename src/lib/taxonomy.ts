/**
 * Material taxonomy for construction procurement: group → family.
 * A supplier that has supplied one family is likely able to supply its siblings in `related`
 * (e.g. fiber-optic cable → other cables, cable accessories). Keywords are matched case-insensitively.
 */
export type Family = { key: string; zh: string; en: string; group: string; kw: string[]; related: string[] };
export type Group = { key: string; zh: string; en: string; material: boolean };

export const GROUPS: Group[] = [
  { key: "elec", zh: "电气", en: "Electrical", material: true },
  { key: "pipe", zh: "管道与给排水", en: "Piping & plumbing", material: true },
  { key: "hvac", zh: "暖通空调", en: "HVAC", material: true },
  { key: "fire", zh: "消防", en: "Fire protection", material: true },
  { key: "elv", zh: "弱电与安防", en: "ELV & security", material: true },
  { key: "steel", zh: "钢材与金属件", en: "Steel & metalwork", material: true },
  { key: "concrete", zh: "水泥与混凝土", en: "Cement & concrete", material: true },
  { key: "aggregate", zh: "地材", en: "Aggregates & earth", material: true },
  { key: "masonry", zh: "砌块与铺装", en: "Masonry & paving", material: true },
  { key: "finish", zh: "建筑装饰材料", en: "Finishes", material: true },
  { key: "envelope", zh: "防水保温与门窗", en: "Waterproofing, insulation & openings", material: true },
  { key: "landscape", zh: "景观与户外", en: "Landscape & outdoor", material: true },
  { key: "chem", zh: "化工与油品", en: "Chemicals & fuels", material: true },
  { key: "water", zh: "水处理设备", en: "Water treatment", material: true },
  { key: "tools", zh: "工器具与劳保", en: "Tools & PPE", material: true },
  { key: "rental", zh: "设备租赁与运输", en: "Equipment rental & transport", material: true },
  { key: "subcon", zh: "施工分包", en: "Subcontracting", material: false },
  { key: "service", zh: "专业服务", en: "Professional services", material: false },
];

const f = (key: string, group: string, zh: string, en: string, kw: string[], related: string[] = []): Family => ({ key, group, zh, en, kw, related });

export const FAMILIES: Family[] = [
  // electrical
  f("cable", "elec", "电缆电线", "Cables & wires", ["电缆", "电线", "光缆", "光纤", "cable", "electrical wire", "building wire", "fiber", "fibre", "optic", "xlpe", "armoured", "armored"], ["cable_acc", "tray", "lv_panel"]),
  f("cable_acc", "elec", "电缆附件", "Cable accessories", ["电缆头", "接头", "终端", "电缆附件", "gland", "lug", "termination", "joint kit"], ["cable", "tray"]),
  f("tray", "elec", "桥架与线管", "Cable trays & conduits", ["桥架", "线管", "线槽", "电缆沟盖", "cable tray", "trunking", "conduit", "ladder"], ["cable", "cable_acc", "steel_section"]),
  f("lv_panel", "elec", "配电箱柜与开关", "Panels & switchgear", ["配电箱", "配电柜", "开关柜", "开关", "断路器", "低压柜", "panel", "switchgear", "breaker", "mcc", "db box", "distribution board"], ["transformer", "cable", "automation"]),
  f("transformer", "elec", "变压器与电源", "Transformers & power", ["变压器", "ups", "稳压", "发电机", "transformer", "generator", "substation", "变电"], ["lv_panel", "cable"]),
  f("lighting", "elec", "灯具照明", "Lighting", ["灯", "照明", "路灯", "庭院灯", "投光", "light", "lamp", "luminaire", "led", "pole"], ["lv_panel", "cable", "earthing"]),
  f("automation", "elec", "自控与仪表", "Automation & instruments", ["变频器", "plc", "仪表", "传感器", "自控", "控制系统", "scada", "vfd", "inverter", "instrument", "sensor", "flowmeter", "流量计"], ["lv_panel", "cable"]),
  f("earthing", "elec", "防雷接地", "Earthing & lightning", ["接地", "防雷", "避雷", "earthing", "grounding", "lightning"], ["cable", "lighting"]),
  // piping
  f("plastic_pipe", "pipe", "塑料管材", "Plastic pipes", ["hdpe", "pvc", "upvc", "ppr", "pe管", "塑料管", "pe pipe"], ["fitting", "valve", "grp_pipe"]),
  f("grp_pipe", "pipe", "玻璃钢管", "GRP / FRP pipes", ["grp", "frp", "玻璃钢", "fiberglass", "fibreglass"], ["plastic_pipe", "fitting", "valve"]),
  f("metal_pipe", "pipe", "钢管与铸铁管", "Steel & ductile iron pipes", ["钢管", "镀锌管", "球墨", "铸铁管", "不锈钢管", "steel pipe", "ductile", "di pipe", "gi pipe", "galvanized pipe"], ["fitting", "valve", "steel_section"]),
  f("fitting", "pipe", "管件法兰", "Fittings & flanges", ["管件", "法兰", "弯头", "三通", "fitting", "flange", "elbow", "tee", "coupling"], ["plastic_pipe", "metal_pipe", "valve"]),
  f("valve", "pipe", "阀门", "Valves", ["阀", "valve"], ["fitting", "pump", "metal_pipe"]),
  f("pump", "pipe", "水泵", "Pumps", ["水泵", "泵", "pump"], ["valve", "automation"]),
  f("sanitary", "pipe", "卫浴洁具与排水件", "Sanitary ware & drainage", ["洁具", "卫浴", "马桶", "地漏", "检查井", "井盖", "sanitary", "toilet", "manhole", "gully", "drain"], ["plastic_pipe", "fitting"]),
  // hvac / fire / elv
  f("hvac_eq", "hvac", "空调设备", "Air conditioning", ["暖通", "空调", "冷水机", "风机盘管", "hvac", "chiller", "ac unit", "split", "fcu", "ahu"], ["duct", "lv_panel"]),
  f("duct", "hvac", "风管与风机", "Ducts & fans", ["风管", "风机", "风口", "duct", "fan", "diffuser", "damper"], ["hvac_eq"]),
  f("fire_eq", "fire", "消防设备与器材", "Fire fighting equipment", ["消防", "喷淋", "灭火", "消火栓", "火灾报警", "fire", "sprinkler", "extinguisher", "hydrant", "fire alarm"], ["valve", "pump", "security"]),
  f("security", "elv", "安防监控门禁", "Security & CCTV", ["监控", "安防", "安全系统", "门禁", "cctv", "camera", "access control", "security"], ["network", "fire_eq"]),
  f("network", "elv", "网络通信", "Networks & telecom", ["网络", "交换机", "通信", "光端机", "network", "switch", "telecom", "wifi"], ["cable", "security"]),
  // steel
  f("rebar", "steel", "钢筋", "Rebar", ["钢筋", "螺纹钢", "rebar", "reinforcement", "deformed bar"], ["steel_section", "mesh"]),
  f("mesh", "steel", "钢筋网与钢丝", "Mesh & wire", ["钢筋网", "钢丝", "铁丝", "围网", "mesh", "binding wire", "fence"], ["rebar"]),
  f("steel_section", "steel", "型钢与钢板", "Sections & plates", ["型钢", "工字钢", "槽钢", "角钢", "钢板", "h型钢", "beam", "channel", "angle", "plate", "section", "steel structure", "钢结构"], ["rebar", "fastener", "metal_pipe"]),
  f("fastener", "steel", "紧固件与标准件", "Fasteners & standard parts", ["螺栓", "螺母", "螺丝", "紧固件", "标准件", "锚栓", "bolt", "nut", "screw", "anchor", "fastener"], ["steel_section", "tools"]),
  f("metalwork", "steel", "金属制品", "Metal products", ["栏杆", "格栅", "井盖", "爬梯", "护栏", "railing", "grating", "handrail", "guardrail", "metal works"], ["steel_section", "fastener"]),
  // concrete / aggregates / masonry
  f("cement", "concrete", "水泥", "Cement", ["水泥", "cement", "opc", "src"], ["readymix", "admixture"]),
  f("readymix", "concrete", "商品混凝土", "Ready-mix concrete", ["混凝土", "商砼", "ready mix", "readymix", "concrete"], ["cement", "aggregate", "admixture"]),
  f("precast", "concrete", "混凝土预制件", "Precast concrete", ["预制", "管涵", "箱涵", "precast", "culvert", "hollow core"], ["readymix", "block"]),
  f("admixture", "concrete", "外加剂与灌浆料", "Admixtures & grouts", ["外加剂", "减水剂", "灌浆料", "砂浆", "admixture", "grout", "mortar", "plasticizer"], ["cement", "waterproof"]),
  f("aggregate", "aggregate", "砂石骨料", "Sand & aggregates", ["河砂", "中砂", "细砂", "砂子", "沙子", "石子", "碎石", "骨料", "级配", "砂石", "sand", "aggregate", "gravel", "crushed"], ["fill", "readymix"]),
  f("fill", "aggregate", "回填料与土方", "Fill & earth", ["回填", "土方", "fill", "earth", "soil", "subbase", "sub-base"], ["aggregate"]),
  f("block", "masonry", "砌块与砖", "Blocks & bricks", ["砌块", "砖", "空心砖", "block", "brick"], ["paver", "cement", "precast"]),
  f("paver", "masonry", "联锁块与铺装砖", "Pavers & interlock", ["联锁", "铺装砖", "透水砖", "植草砖", "interlock", "paver", "paving"], ["kerb", "block", "stone"]),
  f("kerb", "masonry", "路缘石", "Kerbs", ["路缘石", "路沿石", "kerb", "curb"], ["paver", "precast"]),
  // finishes / envelope
  f("tile", "finish", "瓷砖", "Tiles", ["瓷砖", "地砖", "墙砖", "tile", "porcelain", "ceramic"], ["stone", "adhesive", "sanitary"]),
  f("stone", "finish", "石材", "Natural stone", ["石材", "大理石", "花岗岩", "marble", "granite", "stone"], ["tile", "paver"]),
  f("paint", "finish", "涂料油漆", "Paints & coatings", ["涂料", "油漆", "防腐漆", "paint", "coating", "epoxy"], ["waterproof", "chem_misc"]),
  f("ceiling", "finish", "吊顶与隔墙", "Ceilings & partitions", ["吊顶", "石膏板", "隔墙", "ceiling", "gypsum", "partition", "drywall"], ["paint", "insulation"]),
  f("adhesive", "finish", "胶粘剂与密封胶", "Adhesives & sealants", ["瓷砖胶", "胶粘", "密封胶", "玻璃胶", "adhesive", "sealant", "silicone"], ["tile", "waterproof"]),
  f("door_window", "envelope", "门窗幕墙", "Doors, windows & glazing", ["门窗", "防火门", "木门", "钢门", "铝门", "窗户", "百叶窗", "幕墙", "玻璃", "铝合金", "door", "window", "glazing", "curtain wall", "aluminium", "aluminum"], ["ceiling", "metalwork"]),
  f("waterproof", "envelope", "防水材料", "Waterproofing", ["防水", "卷材", "waterproof", "membrane", "bitumen"], ["insulation", "adhesive"]),
  f("insulation", "envelope", "保温材料", "Insulation", ["保温", "岩棉", "挤塑板", "insulation", "rock wool", "xps", "eps"], ["waterproof", "ceiling"]),
  // landscape
  f("outdoor_furniture", "landscape", "户外家具与设施", "Outdoor furniture", ["座椅", "垃圾桶", "户外家具", "遮阳", "bench", "bin", "shade", "pergola", "furniture"], ["play", "signage"]),
  f("play", "landscape", "游乐与健身设备", "Play & fitness equipment", ["游乐", "儿童", "健身", "playground", "play equipment", "fitness"], ["outdoor_furniture"]),
  f("planting", "landscape", "苗木与绿化", "Plants & irrigation", ["苗木", "植物", "草坪", "灌溉", "绿化", "plant", "tree", "irrigation", "turf", "grass"], ["plastic_pipe"]),
  f("signage", "landscape", "标识标牌", "Signage", ["标识", "标牌", "指示牌", "sign", "signage"], ["outdoor_furniture", "metalwork"]),
  // chemicals / water / tools
  f("fuel", "chem", "燃油与润滑油", "Fuels & lubricants", ["燃油", "柴油", "汽油", "润滑", "机油", "diesel", "fuel", "lubricant", "oil", "grease"], ["gas"]),
  f("gas", "chem", "工业气体", "Industrial gases", ["氧气", "乙炔", "氩气", "气体", "oxygen", "acetylene", "argon", "gas"], ["fuel", "welding"]),
  f("chem_misc", "chem", "化学品与药剂", "Chemicals", ["化学", "药剂", "次氯酸", "液氯", "氯气", "chemical", "chlorine", "hypochlorite"], ["water_eq"]),
  f("water_eq", "water", "水处理与制氯设备", "Water treatment equipment", ["制氯", "水处理", "筛网", "过滤", "海水", "chlorination", "water treatment", "screen", "filter", "desalination"], ["pump", "valve", "chem_misc"]),
  f("tools", "tools", "工器具", "Tools", ["工具", "工器具", "电动工具", "tool", "drill", "grinder"], ["ppe", "fastener", "welding"]),
  f("welding", "tools", "焊材", "Welding consumables", ["焊条", "焊丝", "焊材", "welding", "electrode"], ["gas", "tools"]),
  f("ppe", "tools", "劳保用品", "PPE", ["劳保", "安全帽", "手套", "反光衣", "安全鞋", "ppe", "helmet", "gloves", "safety shoes", "vest"], ["tools"]),
  // rental & transport
  f("crane", "rental", "吊车起重", "Cranes & lifting", ["吊车", "吊机", "起重", "汽车吊", "crane", "lifting"], ["truck", "manlift"]),
  f("manlift", "rental", "升降机与高空车", "Man-lifts & forklifts", ["升降机", "高空作业", "叉车", "manlift", "boom lift", "scissor", "forklift"], ["crane", "earthmoving"]),
  f("earthmoving", "rental", "土方机械", "Earthmoving machinery", ["挖机", "挖掘机", "装载机", "平地机", "压路机", "推土机", "excavator", "loader", "grader", "roller", "dozer"], ["truck", "manlift"]),
  f("truck", "rental", "车辆运输", "Trucks & transport", ["板车", "车头", "运输", "大巴", "自卸车", "垃圾清运", "水车", "truck", "trailer", "bus", "transport", "dump", "logistics"], ["crane", "earthmoving"]),
  f("scaffold", "rental", "脚手架与模板", "Scaffolding & formwork", ["脚手架", "模板", "支撑", "scaffold", "formwork", "shoring"], ["manlift", "steel_section"]),
  // non-material
  f("sub_civil", "subcon", "土建与结构分包", "Civil & structural works", ["土建", "混凝土工程", "钢结构工程", "地基", "桩基", "土石方", "道路工程", "临建", "civil works", "piling", "earthworks", "road works"], ["sub_mep", "sub_finish"]),
  f("sub_mep", "subcon", "机电安装分包", "MEP installation", ["机电安装", "安装工程", "mep", "installation"], ["sub_civil"]),
  f("sub_finish", "subcon", "装饰与绿化分包", "Finishing & landscaping works", ["装饰装修工程", "园林绿化工程", "fit-out", "landscaping works"], ["sub_civil"]),
  f("svc_test", "service", "检测试验与勘察", "Testing, survey & inspection", ["检测", "试验", "勘察", "地勘", "测量", "testing", "laboratory", "survey", "inspection", "geotechnical"], ["svc_design"]),
  f("svc_design", "service", "设计咨询", "Design & consulting", ["设计", "咨询", "认证", "bim", "design", "consult", "leed", "breeam"], ["svc_test"]),
  f("svc_other", "service", "其他服务", "Other services", ["法律", "律师", "劳务", "网络服务", "清洁", "legal", "law", "manpower", "cleaning", "service"], []),
];

export const FAMILY: Record<string, Family> = Object.fromEntries(FAMILIES.map((x) => [x.key, x]));
export const GROUP: Record<string, Group> = Object.fromEntries(GROUPS.map((x) => [x.key, x]));

/** Older single-level categories (demand items) → families. */
const LEGACY: Record<string, string[]> = {
  "瓷砖": ["tile"], "混凝土铺装砖/联锁块": ["paver"], "路缘石": ["kerb"], "管材": ["plastic_pipe", "metal_pipe", "grp_pipe"],
  "碎石/骨料": ["aggregate"], "石材": ["stone"], "灯具": ["lighting"], "钢制品/金属件": ["metalwork", "steel_section"],
  "混凝土预制件": ["precast"], "标识标牌": ["signage"], "户外家具/景观设施": ["outdoor_furniture"], "游乐设备": ["play"],
};

/** Families mentioned in a piece of text (material name, spec, ledger line), best match first. */
const ascii = /^[\x00-\x7f]+$/;
const kwRe = new Map<string, RegExp>();
/** Latin keywords match whole words (plural allowed), so "oil" doesn't hit "soil"; Chinese ones match as substrings. */
function hit(t: string, k: string) {
  if (!ascii.test(k)) return t.includes(k);
  let re = kwRe.get(k);
  if (!re) { re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^a-z0-9]|$)`); kwRe.set(k, re); }
  return re.test(t);
}

export function classify(text: string, legacyCategory?: string): string[] {
  const t = String(text || "").toLowerCase();
  const scored: [string, number][] = [];
  for (const fam of FAMILIES) {
    let best = 0;
    for (const k of fam.kw) if (hit(t, k)) best = Math.max(best, k.length);
    if (best) scored.push([fam.key, best]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const out = scored.map(([k]) => k);
  for (const k of (legacyCategory && LEGACY[legacyCategory]) || []) if (!out.includes(k)) out.push(k);
  return out;
}

/** Families the AI may use, as a compact list for prompts. */
export function familyList(): string {
  return GROUPS.map((g) => `${g.zh}: ${FAMILIES.filter((x) => x.group === g.key).map((x) => `${x.key}=${x.zh}`).join("，")}`).join("\n");
}

export const familyName = (key: string, lang: string) => { const x = FAMILY[key]; return x ? (lang === "zh" ? x.zh : x.en) : key; };
export const groupName = (key: string, lang: string) => { const x = GROUP[key]; return x ? (lang === "zh" ? x.zh : x.en) : key; };
