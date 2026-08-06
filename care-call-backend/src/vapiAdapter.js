// Vapi sends tool-call requests shaped like:
//   { "message": { "toolCallList": [ { "id": "...", "name": "...", "arguments": {...} } ] } }
// and expects a response shaped like:
//   { "results": [ { "toolCallId": "...", "result": "<string>" } ] }
// with HTTP 200 ALWAYS, even for errors — any other status code is ignored by Vapi entirely.
//
// Our route files were built and tested expecting plain flat JSON in req.body, and
// respond with res.json({ result: "some string", ...extra }). Rather than rewriting
// every route, this middleware translates in both directions:
//   - incoming: unwraps toolCallList[0].arguments into req.body, so routes see the
//     same flat shape they already expect
//   - outgoing: wraps whatever the route sent back into Vapi's { results: [...] }
//     shape, using the "result" field the route already provides
//
// If the request DOESN'T look like it came from Vapi (e.g. your own Invoke-RestMethod
// testing), this middleware does nothing and everything behaves exactly as before.

export function vapiAdapter(req, res, next) {
  const toolCall = req.body?.message?.toolCallList?.[0] || req.body?.message?.toolCalls?.[0];

  if (!toolCall) {
    return next(); // not a Vapi request — leave everything as-is
  }

  const toolCallId = toolCall.id;
  const realCallId = req.body?.message?.call?.id; // grab BEFORE we overwrite req.body below

  // Vapi's real payload nests arguments under toolCall.function.arguments, though some
  // integrations put them directly on toolCall.arguments or toolCall.parameters instead —
  // check all three spots to be safe.
  let extractedArgs = toolCall.function?.arguments ?? toolCall.arguments ?? toolCall.parameters ?? {};

  // Some integrations send arguments as a JSON-encoded STRING rather than a parsed
  // object — detect and parse that case too.
  if (typeof extractedArgs === 'string') {
    try {
      extractedArgs = JSON.parse(extractedArgs);
    } catch {
      extractedArgs = {};
    }
  }

  req.body = extractedArgs;
  if (realCallId && !req.body.vapiCallId) {
    req.body.vapiCallId = realCallId;
  }

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const resultString = typeof data?.result === 'string' ? data.result : JSON.stringify(data);
    res.status(200); // Vapi ignores any non-200 response entirely, so always force 200
    return originalJson({
      results: [{ toolCallId, result: resultString }],
    });
  };

  next();
}