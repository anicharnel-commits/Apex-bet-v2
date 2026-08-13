const OpenAI=require("openai");
const {openaiKey,openaiModel}=require("./config");
async function explain(question,context){
 if(!openaiKey)return {answer:"Apex Lab IA n'est pas configuré. L'analyse structurée reste disponible.",aiEnabled:false};
 const c=new OpenAI({apiKey:openaiKey});
 const input=`Tu es Apex Lab, assistant explicatif sportif. Réponds en français, clairement, sans promettre de gain ni présenter une sélection comme certaine.\nQuestion: ${question}\nDonnées: ${JSON.stringify(context)}`;
 const r=await c.responses.create({model:openaiModel,input});
 return {answer:r.output_text||"Aucune explication générée.",aiEnabled:true};
}
module.exports={explain};
