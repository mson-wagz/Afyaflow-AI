// Competition runs are isolated from the research deployment, including its database.
export function runtimePolicy(env:NodeJS.ProcessEnv) {
  const mode=env.APP_MODE || 'research';
  if(!['research','competition'].includes(mode))throw new Error('APP_MODE must be research or competition.');
  const provider=env.AI_PROVIDER || (mode==='competition'?'ollama':'bedrock');
  if(!['bedrock','openai','ollama'].includes(provider))throw new Error('AI_PROVIDER must be bedrock, openai or ollama.');
  const endpoint=new URL(env.OLLAMA_URL || 'http://127.0.0.1:11434');
  if(endpoint.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname) ||
    endpoint.username || endpoint.password || endpoint.pathname!=='/' || endpoint.search || endpoint.hash)
    throw new Error('OLLAMA_URL must be a local loopback HTTP origin. Remote model endpoints are disabled.');
  const ollamaModel=env.OLLAMA_MODEL || 'qwen3:0.6b';
  if(!/^[a-zA-Z0-9._/-]+:[a-zA-Z0-9._-]+$/.test(ollamaModel) || /cloud/i.test(ollamaModel))
    throw new Error('OLLAMA_MODEL must identify a local model tag; cloud models are disabled.');
  if(mode==='competition' && provider!=='ollama')throw new Error('Competition mode requires AI_PROVIDER=ollama.');
  const dataResidency=dataResidencyPolicy(env,provider);
  return {mode,provider,ollamaUrl:endpoint.origin,ollamaModel,dataResidency};
}

/**
 * DATA_RESIDENCY=kenya keeps patient data processing in Kenya: AI inference must use the local
 * model on this host (no hosted provider, so assessment inputs never leave the server), and the
 * operator must declare the host country with HOSTING_COUNTRY=KE. The software cannot verify a
 * server's physical location; the declaration is the operator's statement, reported by /api/health.
 */
export function dataResidencyPolicy(env:NodeJS.ProcessEnv,provider:string) {
  const residency=env.DATA_RESIDENCY || 'unrestricted';
  if(!['unrestricted','kenya'].includes(residency))throw new Error('DATA_RESIDENCY must be unrestricted or kenya.');
  if(residency==='kenya') {
    if(provider!=='ollama')
      throw new Error('DATA_RESIDENCY=kenya requires AI_PROVIDER=ollama: hosted inference would send assessment inputs outside Kenya.');
    if((env.HOSTING_COUNTRY || '').toUpperCase()!=='KE')
      throw new Error('DATA_RESIDENCY=kenya requires HOSTING_COUNTRY=KE, the operator\'s declaration that this server and its database are hosted in Kenya.');
  }
  return {policy:residency,inference:provider==='ollama'?'local':'hosted',hostingCountry:(env.HOSTING_COUNTRY || '').toUpperCase() || null};
}

export function assertCompetitionRun(mode:string,source:string,provider:string) {
  if(mode==='competition' && (source!=='synthetic' || provider!=='ollama'))
    throw new Error('Competition mode permits synthetic records and the local Ollama provider only.');
}
