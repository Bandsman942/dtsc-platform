import fs from "node:fs";

const chatPath = "app/api/enterprise/ai/chat/route.ts";
const knowledgePath = "lib/enterprise-ai/knowledge.ts";

let chat = fs.readFileSync(chatPath, "utf8");
const oldStatusReturn = `      return NextResponse.json(\n        { error: reasonCode, reasonCode, message: getAiErrorMessage(reasonCode, locale) },\n        { status: statusCode }\n      );`;
const newStatusReturn = `      return NextResponse.json({ error: reasonCode, reasonCode, message: getAiErrorMessage(reasonCode, locale) }, { status: statusCode });`;
if (!chat.includes(oldStatusReturn)) throw new Error("ENTERPRISE_AI_STATUS_RETURN_ANCHOR_NOT_FOUND");
chat = chat.replace(oldStatusReturn, newStatusReturn);
fs.writeFileSync(chatPath, chat);

let knowledge = fs.readFileSync(knowledgePath, "utf8");
const oldCitationMap = `  const citations: EnterpriseAiKnowledgeCitation[] = reranked.map(({ value }) => {\n    const { chunkId: _chunkId, ...citation } = value;\n    return citation;\n  });`;
const newCitationMap = `  const citations: EnterpriseAiKnowledgeCitation[] = reranked.map(({ value }) => ({\n    sourceId: value.sourceId,\n    title: value.title,\n    confidentiality: value.confidentiality,\n    dataClassification: value.dataClassification,\n    sourceVersion: value.sourceVersion,\n    indexVersion: value.indexVersion,\n    content: value.content,\n    distance: value.distance,\n    lexicalRank: value.lexicalRank,\n    hybridScore: value.hybridScore,\n    language: value.language,\n    pageNumber: value.pageNumber,\n    section: value.section,\n  }));`;
if (!knowledge.includes(oldCitationMap)) throw new Error("ENTERPRISE_RAG_CITATION_MAP_ANCHOR_NOT_FOUND");
knowledge = knowledge.replace(oldCitationMap, newCitationMap);
fs.writeFileSync(knowledgePath, knowledge);

console.log("AI05 CI source contracts fixed");
