import { checklistText, CATEGORIES } from "./checklist";

export function demandPrompt(content: string, hasImages: boolean) {
  return `下面是工程部提交的物资需用计划（需求清单）${hasImages ? "，附图是清单页面" : "的内容"}。请提取全部物资项，判断材料类别，并按“材料澄清参数清单”检查每一项缺了哪些必须明确的参数，生成需要工程部确认的问题。

材料澄清参数清单：
${checklistText()}

可用的材料类别：${CATEGORIES.join("、")}

只输出一个 JSON 对象：
{"project":"项目名称，没有就空字符串","department":"请购部门",
"items":[{"no":"需求序号","nameCn":"中文名称","nameEn":"英文名称","spec":"规格型号","unit":"单位","qty":390500,"dateRequired":"需用时间","techReq":"技术要求","specRef":"规范章节号，如 32 14 13.13；没有就空字符串","category":"材料类别","issues":["数据问题：名称和规格矛盾、疑似重复、单位不明确、缺数量等"],"questions":[{"question":"中文问题","questionEn":"English question","options":["可选项1","可选项2"]}]}]}
规则：
1. items 按清单原顺序输出全部物资项，不能遗漏；qty 为纯数字；规格里的换行改成空格。
2. 忽略 =DISPIMG(...)、[图片] 之类的图片占位。
3. questions 只针对清单里确实没写清楚、而参数清单要求明确的参数，每个问题尽量给 2–4 个可选项；已经写清楚的不要问。不在参数清单里的类别，只问影响报价的关键缺项。
4. 没有问题就给空数组。
${content ? "清单内容：\n" + content : ""}`;
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
