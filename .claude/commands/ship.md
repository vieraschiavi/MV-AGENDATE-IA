---
description: Checkpoint + commit + push + PR draft
---

Publicá el trabajo actual:
1. Corré **`npm test`**; si algún test falla, pará y reportá (no sigas).
2. `git add` de los cambios relevantes y mostrá un `git diff --staged` resumido.
3. Commiteá con un mensaje claro y descriptivo (qué y por qué).
4. Push a la rama de trabajo (`git push -u origin <rama>`).
5. Si no existe un PR abierto para la rama, abrí uno en **draft** (el repo no tiene
   template de PR, así que describí qué cambió, cómo se probó y el impacto).

Contexto extra del usuario: $ARGUMENTS
