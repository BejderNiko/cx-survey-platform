# Figma OAuth configuration

Register this exact callback path in Figma OAuth:

`/api/figma/callback`

Register local and every Preview URL separately. Example local callback: `http://localhost:3000/api/figma/callback`.

Required environment-variable names:

- `FIGMA_OAUTH_CLIENT_ID`
- `FIGMA_OAUTH_CLIENT_SECRET`
- `FIGMA_OAUTH_REDIRECT_URI`
- `NEXT_PUBLIC_FIGMA_EMBED_CLIENT_ID`

Keep client secret server-only. Do not prefix it with `NEXT_PUBLIC_`.

Use OAuth scope `file_content:read`. The builder import and frame-picker use server OAuth. Participant prototype runtime uses only `NEXT_PUBLIC_FIGMA_EMBED_CLIENT_ID` and validated Figma browser messages. OAuth client and Embed client are separate.

If Figma returns 401 or 403: check OAuth scope, then direct file/project/team access for OAuth account. Reconnect OAuth after access change.
