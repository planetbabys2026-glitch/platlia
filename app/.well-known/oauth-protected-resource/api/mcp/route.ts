/**
 * La misma respuesta, en la dirección "con el camino del recurso pegado atrás".
 *
 * El RFC 9728 define esa forma —`/.well-known/oauth-protected-resource/api/mcp`—
 * y hay clientes que solo prueban esa, así que las dos tienen que existir o el
 * descubrimiento falla según con qué se conecte.
 */
export { GET, OPTIONS, dynamic } from "../../route";
