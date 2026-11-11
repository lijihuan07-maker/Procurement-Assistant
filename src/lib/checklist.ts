/** 材料澄清参数清单（起步版）。产品的核心经验资产，按类别逐项检查需求是否写清楚。 */
export const CHECKLIST: { category: string; params: string[]; example: string }[] = [
  { category: "瓷砖", params: ["Ceramic 还是 Porcelain", "尺寸", "厚度", "表面（亚光/抛光/防滑）", "防滑等级 R9–R13", "颜色或型号", "室内还是室外"], example: "只写“TILE 600×600”" },
  { category: "混凝土铺装砖/联锁块", params: ["尺寸和厚度", "颜色", "抗压强度", "计价单位（块还是 m²）及每 m² 块数"], example: "按块询价，供应商按 m² 报价" },
  { category: "路缘石", params: ["截面（宽×高）", "单块长度", "类型（立缘/平缘/降坡 TCR）", "颜色", "强度"], example: "只写“150mm THK”" },
  { category: "管材", params: ["材质（PPR/UPVC/HDPE/铸铁/镀锌钢）", "管径是 DN 还是外径", "压力等级或 SDR", "执行标准（ASTM/BS/ISO）", "连接方式", "是否含管件"], example: "只写管径，不写压力等级" },
  { category: "碎石/骨料", params: ["粒径范围", "石材种类", "颜色", "计价单位（吨还是 m³）", "是否含运到现场"], example: "名称写米色，规格却写 WHITE" },
  { category: "石材", params: ["品种和产地", "表面处理（火烧/荔枝面/抛光）", "厚度", "尺寸", "颜色样板确认"], example: "COLOR TO RC APPROVAL" },
  { category: "灯具", params: ["功率", "色温", "光通量", "防护等级 IP", "灯杆高度和材质", "控制方式", "沙特当地认证（如 SASO）"], example: "只有规范条款号，没有型号" },
  { category: "钢制品/金属件", params: ["材质牌号（碳钢/304/316 不锈钢）", "表面处理（热镀锌/喷涂）", "板厚", "是否按图纸加工"], example: "只写“钢制自行车架”和尺寸" },
];

export function checklistText() {
  return CHECKLIST.map((c) => `- ${c.category}：${c.params.join("；")}（常见含糊写法：${c.example}）`).join("\n");
}

export const CATEGORIES = [...CHECKLIST.map((c) => c.category), "混凝土预制件", "标识标牌", "户外家具/景观设施", "游乐设备", "其他"];
