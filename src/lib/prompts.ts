import { checklistText, CATEGORIES } from "./checklist";

export function demandPrompt(content: string, hasImages: boolean, chunk?: { part: number; parts: number; context: string }) {
  const rowIds = /^[RL]\d+\|/m.test(content);
  const partNote = chunk && chunk.parts > 1
    ? `\n这份清单较长，分成 ${chunk.parts} 部分并行处理，现在是第 ${chunk.part} 部分。${chunk.context ? "“表头参考”只用来理解各列含义，不要提取其中的物资；" : ""}只提取“本部分内容”里的物资项。本部分最后一行如果明显没写完，照常提取。`
    : "";
  const body = chunk?.context ? `表头参考（不要提取）：\n${chunk.context}\n\n本部分内容：\n${content}` : content ? "清单内容：\n" + content : "";
  return `下面是工程部提交的物资需用计划（需求清单）${hasImages ? "，附图是清单页面" : "的内容"}。${rowIds ? "每行开头的 R12| 或 L12| 是行号。" : ""}${partNote}请提取全部物资项，判断材料类别，并按“材料澄清参数清单”检查每一项缺了哪些必须明确的参数，生成需要工程部确认的问题。

材料澄清参数清单：
${checklistText()}

可用的材料类别：${CATEGORIES.join("、")}

只输出一个 JSON 对象：
{"project":"项目名称，没有就空字符串","department":"请购部门",
"items":[{"row":"该物资所在行的行号，如 R12；没有行号就空字符串","no":"需求序号","nameCn":"中文名称","nameEn":"英文名称","spec":"规格型号","unit":"单位","qty":390500,"dateRequired":"需用时间","techReq":"技术要求","specRef":"规范章节号，如 32 14 13.13；没有就空字符串","category":"材料类别","issues":["数据问题：名称和规格矛盾、疑似重复、单位不明确、缺数量等"],"questions":[{"question":"中文问题","questionEn":"English question","options":["可选项1","可选项2"]}]}]}
规则：
1. items 按清单原顺序输出全部物资项，不能遗漏；qty 为纯数字；规格里的换行改成空格。
2. 忽略 =DISPIMG(...)、[图片] 之类的图片占位。
3. questions 只针对清单里确实没写清楚、而参数清单要求明确的参数，每个问题尽量给 2–4 个可选项；已经写清楚的不要问。不在参数清单里的类别，只问影响报价的关键缺项。
4. 没有问题就给空数组。
${body}`;
}

export function clarifyPrompt(items: { id: string; name: string; spec: string; techReq: string; questions: { id: string; question: string; options: string[] }[]; excerpts: { sectionNo: string; title: string; pages: string; text: string }[] }[]) {
  return `你是工程采购助理。下面是若干需求项、它们待确认的问题，以及技术规格书中相关章节的原文。请根据规格书原文回答能回答的问题。

数据（JSON）：
${JSON.stringify(items)}

只输出一个 JSON 对象：
{"answers":[{"questionId":"问题 id","answer":"答案（简短，优先用可选项的原文）","specQuote":"支持这个答案的规格书原文，30–200 字，注明章节号和页码"}],
"specUpdates":[{"itemId":"需求项 id","techReq":"从规格书提炼的技术要求要点，英文，100 字以内，写进询价单"}]}
规则：只回答规格书原文明确写到的问题，不确定的不要回答；specQuote 必须是原文摘录，不能编造。`;
}

export function splitPrompt(items: { no: string; nameCn: string; nameEn: string; spec: string; unit: string; qty: number; category: string }[]) {
  return `你是工程项目的采购工程师。请把下面的需求项按“同一类供应商能一起报价”的原则拆分成询价包。
拆分原则：
- 同类材料、同类厂家放一个包。例如：混凝土预制铺装砖、路缘石、挡轮器等混凝土预制件；花岗岩、大理石等石材；碎石骨料；钢结构和金属制品；景观照明；标识标牌；户外家具和景观设施；儿童游乐设备。
- 专业性强、需要专门厂家的单件设备可以单独成包；不要为了凑数把无关材料放在一起。
- 每个需求项必须且只能属于一个包。

需求项（JSON）：${JSON.stringify(items)}

只输出一个 JSON 对象：
{"packages":[{"code":"P1","titleEn":"英文询价标题，大写","titleCn":"中文名称","supplierType":"目标供应商类型，如 混凝土预制件厂","reason":"一句话说明为什么放在一起","items":["需求序号"]}],
"hints":[{"no":"需求序号","quoteHint":"给供应商的一句英文报价提示"}]}
quoteHint 只在容易报错时填写：按块(Ea)计的铺装砖写明每 m² 约多少块并要求注明换算；规格不完整时提示按图纸报价；灯具要求提供功率、防护等级和认证。`;
}

export function quotePrompt(fileName: string, content: string, hasImages: boolean, rfq: { lines: { no: string; name: string; spec: string; unit: string; qty: number }[]; terms: Record<string, string>; currency: string; vatRate: number }) {
  return `你负责把一份供应商报价对齐到询价项目。
询价项目（JSON）：${JSON.stringify(rfq.lines)}
询价要求的条款：${JSON.stringify(rfq.terms)}
询价币种：${rfq.currency}，增值税率：${rfq.vatRate}

下面是文件「${fileName}」${hasImages ? "，附图是报价单页面" : "的内容"}。只输出一个 JSON 对象：
{"supplier":"供应商公司名；文件里没有写就用「文件名（未填公司名）」","quoteNo":null,"date":"YYYY-MM-DD 或 null","currency":"SAR",
"vatIncluded":false,"isBlank":false,"statedTotalExVat":null,"statedTotalInclVat":null,
"terms":{"payment":"","delivery":"","leadTime":"","validity":"","priceAdjustment":"","other":""},
"lines":[{"rfqNo":"1","quotedDesc":"供应商写的品名规格，简短","quotedQty":7819.2,"quotedUnit":"m²","unitPrice":28,"perRfqUnit":0.02,"conversionNote":"200×100 砖 50 块/m²","deviation":null}],
"missing":["没有报价的询价序号"],"issues":["这份报价自身的问题，每条一句中文"]}
规则：
1. 按材料、规格、颜色、尺寸、数量把每一行对应到询价序号 rfqNo，一个询价项只对应一行。
2. unitPrice 一律是不含税单价，按 quotedUnit 计价；只给含税价时按税率换算成不含税。
3. quotedUnit 尽量写成 m² / m / m³ / Ea / t / kg / set / lot 之一。单位栏写 Ea 但数量明显是换算成 m² 后的数（例如公式 =390500/50），按实际计价单位 m² 填写。
4. perRfqUnit = 1 个询价单位等于多少个 quotedUnit。单位相同填 1；询价按块(Ea)、报价按 m² 时按名义尺寸算：200×100mm 1 块 = 0.02 m²，200×200mm 1 块 = 0.04 m²。
5. deviation 写报价规格与询价规格的偏离（厚度、尺寸、品牌、材质等），没有填 null。
6. statedTotalExVat / statedTotalInclVat 填报价单上写的合计金额，没写就是 null。
7. terms 用简短中文概括；沿用询价格式且未提出不同条款时写「未提出偏离」。
8. issues 只写有依据的问题：合计与明细不符、单位栏与数量不符、缺公司名/日期/签章、数量按包装取整、付款或锁价与询价要求冲突、报价晚于截止日期。
9. 所有价格都是 0 或空白时 isBlank 为 true，lines 为空数组。
${content ? "文件内容：\n" + content : ""}`;
}

export function reviewPrompt(data: unknown) {
  return `你是资深工程采购经理，审查同一轮询价收到的全部报价，找出比价和定标前需要注意的风险。数据（JSON）：
${JSON.stringify(data)}

只输出一个 JSON 对象：
{"flags":[{"level":"高|中|低|信息","category":"类别，如 供应商独立性 / 规格偏离 / 商务条款 / 计价单位 / 起订量 / 资料完整性","title":"一句话发现","detail":"具体依据，引用数字","action":"建议动作"}],
"summary":"两到三句中文：谁总价最低、低多少，以及定标前最需要先处理的问题"}
重点检查：不同供应商是否疑似同一货源（品名写法、行顺序、取整数量、条款文字高度一致而价格大致成比例）；是否所有供应商都偏离同一规格；付款、锁价、有效期、交货与询价要求冲突；按包装或托盘取整导致多报。不要重复已由规则检查的缺项、合计核对、价差。只写有依据的问题，按严重程度排序，最多 8 条。`;
}

export function titlePrompt(lines: { name: string; spec: string; category: string }[]) {
  return `下面是一份询价单里的全部物资。请给这份询价单起一个简短的名称，让供应商一眼看出询的是哪类材料。

只输出 JSON：{"titleCn":"中文名称，不超过 16 个字，例如：瓷砖及铺贴辅材","titleEn":"ENGLISH TITLE IN CAPITALS, under 8 words, e.g. CERAMIC & PORCELAIN TILES"}
规则：概括材料大类，不要写数量、项目名称、编号，也不要加“询价单”字样。
物资：
${lines.map((l, i) => `${i + 1}. ${l.name}｜${l.spec}｜${l.category}`).join("\n").slice(0, 20000)}`;
}

export function supplierImportPrompt(fileName: string, content: string, hasImages: boolean) {
  return `下面是用户上传的一份文件“${fileName}”${hasImages ? "（附图是文件页面）" : ""}，里面可能是供应商名录、历史采购订单/台账，或者以前做过的比价表（这种表通常每个供应商占一组列，表头是供应商名称，行是物资）。请从中找出真实的供应商公司，以及每家供应商对每种物资给过的单价。

材料类别只能用这些：${CATEGORIES.join("、")}

只输出 JSON：
{"fileKind":"suppliers | purchases | comparison | other 之一",
"suppliers":[{"name":"公司名称（原文，不要翻译）","categories":["材料类别"],"contact":"联系人","email":"邮箱","phone":"电话","city":"城市","notes":"其他有用信息，如付款条件、交期"}],
"prices":[{"supplier":"必须和 suppliers 里的 name 完全一致","material":"物资名称","spec":"规格","unit":"单位","unitPrice":12.5,"currency":"SAR","date":"YYYY-MM-DD，没有就空字符串","kind":"purchase（实际采购/中标）或 quote（只是报价）"}]}
规则：
1. 只有公司（厂家、贸易商、分包商）才是供应商。序号、金额、合计、电话、日期、付款/交货条件、评标方法、表头文字（如“单价（SAR）”“供应商名称”）、本公司和业主的名称都不是供应商。
2. 比价表里，没被选中的供应商的价格 kind 为 quote；有“中标/推荐/选定”标记的为 purchase。看不出来就都按 quote。
3. 电话、邮箱、联系人写在供应商名称下方或旁边的，归到对应供应商。
4. unitPrice 为不含千分位的纯数字，取单价，不要取总价；没有单价的不要输出这一条价格。
5. 供应商的 categories 按它报价的物资判断。不能确定是公司的，宁可不输出。
${content ? "文件内容：\n" + content : ""}`;
}

export function discoverPrompt(q: { category: string; area: string; keywords: string; materials: string[]; exclude: string[] }) {
  return `请上网搜索，找出在“${q.area}”能供应“${q.category}”${q.keywords ? `（${q.keywords}）` : ""}的本地公司：厂家、经销商、贸易商、建材市场里的门店都可以。用于工程项目询价，越能直接联系越好。
${q.materials.length ? `这次要询价的物资示例：${q.materials.slice(0, 12).join("；")}\n` : ""}${q.exclude.length ? `下面这些已经在供应商库里了，不要再列出：${q.exclude.join("、")}\n` : ""}
可以搜：Google 地图/商家目录、公司官网、当地商会名录、黄页（如 Daleeli、Yellow Pages）、LinkedIn、展会名录等。英文和阿拉伯文关键词都试一下。

只输出 JSON：
{"suppliers":[{"name":"公司名称（英文或原文，不要翻译成中文）","city":"所在城市","address":"地址","phone":"电话（带国家区号）","email":"邮箱","website":"官网或商家页面网址","products":"主营产品/品牌，简短","kind":"厂家 | 经销商 | 贸易商 | 门店 之一","evidence":"在哪里查到的，例如 Google 地图 / 官网 / 商会名录"}]}
规则：
1. 只列搜索结果里确实存在的公司，不能编造；电话、邮箱、网址查不到就留空字符串，不要猜。
2. 优先列 ${q.area} 本地的，不够时可以补充同一国家其他城市、能送货到 ${q.area} 的公司，city 写真实所在城市。
3. 尽量给 8–15 家，宁缺毋滥。`;
}
