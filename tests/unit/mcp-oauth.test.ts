import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  redirectPermitido,
  redirectRegistrableEs,
  revisarPeticion,
  urlDeRetorno,
  verificadorCoincide,
} from "@/lib/mcp/oauth";

const verificador = randomBytes(48).toString("base64url");
const desafio = createHash("sha256").update(verificador).digest("base64url");

describe("PKCE", () => {
  it("acepta el verificador que genera el desafío", () => {
    expect(verificadorCoincide(verificador, desafio)).toBe(true);
  });

  it("rechaza cualquier otro verificador", () => {
    expect(verificadorCoincide(randomBytes(48).toString("base64url"), desafio)).toBe(false);
  });

  it("rechaza un verificador demasiado corto para no ser adivinable", () => {
    const corto = "abc";
    const suDesafio = createHash("sha256").update(corto).digest("base64url");
    // Aunque el hash coincida: el RFC pide 43 caracteres como mínimo, y por
    // debajo de eso el desafío deja de proteger nada.
    expect(verificadorCoincide(corto, suDesafio)).toBe(false);
  });

  it("rechaza el vacío en cualquiera de los dos lados", () => {
    expect(verificadorCoincide("", desafio)).toBe(false);
    expect(verificadorCoincide(verificador, "")).toBe(false);
  });
});

describe("la dirección de retorno", () => {
  const registradas = ["https://claude.ai/api/mcp/auth_callback"];

  it("acepta la registrada, exacta", () => {
    expect(redirectPermitido("https://claude.ai/api/mcp/auth_callback", registradas)).toBe(true);
  });

  it("rechaza otro host aunque se le parezca", () => {
    for (const impostor of [
      "https://claude.ai.evil.com/api/mcp/auth_callback",
      "https://evil.com/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/auth_callback/../../robo",
      "https://claude.ai/api/mcp/auth_callback?x=1",
      "http://claude.ai/api/mcp/auth_callback",
    ]) {
      expect(redirectPermitido(impostor, registradas), impostor).toBe(false);
    }
  });

  it("al registrarla, exige https salvo contra la máquina de quien desarrolla", () => {
    expect(redirectRegistrableEs("https://claude.ai/cb")).toBe(true);
    expect(redirectRegistrableEs("http://localhost:3000/cb")).toBe(true);
    expect(redirectRegistrableEs("http://127.0.0.1:9777/cb")).toBe(true);
    expect(redirectRegistrableEs("http://evil.com/cb")).toBe(false);
    expect(redirectRegistrableEs("https://claude.ai/cb#frag")).toBe(false);
    expect(redirectRegistrableEs("no-es-una-url")).toBe(false);
  });
});

describe("la petición de autorización", () => {
  const buena = {
    responseType: "code",
    clientId: "cli_1",
    redirectUri: "https://claude.ai/cb",
    codeChallenge: desafio,
    codeChallengeMethod: "S256",
    state: "xyz",
  };

  it("pasa cuando está completa", () => {
    expect(revisarPeticion(buena)).toBeNull();
  });

  it("rechaza PKCE en 'plain', que manda el verificador a la vista", () => {
    expect(revisarPeticion({ ...buena, codeChallengeMethod: "plain" })).toBe("code_challenge_method");
  });

  it("rechaza si falta el desafío: sin PKCE, robar el código alcanza", () => {
    expect(revisarPeticion({ ...buena, codeChallenge: null })).toBe("code_challenge");
  });

  it("solo admite el flujo de código", () => {
    expect(revisarPeticion({ ...buena, responseType: "token" })).toBe("response_type");
  });
});

describe("la vuelta al cliente", () => {
  it("devuelve el state tal cual vino", () => {
    const u = urlDeRetorno("https://claude.ai/cb", { code: "abc", state: "a b+c/d=" });
    expect(new URL(u).searchParams.get("state")).toBe("a b+c/d=");
    expect(new URL(u).searchParams.get("code")).toBe("abc");
  });

  it("omite lo que no vino en vez de mandar 'null'", () => {
    const u = urlDeRetorno("https://claude.ai/cb", { code: "abc", state: null });
    expect(new URL(u).searchParams.has("state")).toBe(false);
  });

  it("conserva lo que la dirección ya traía", () => {
    const u = urlDeRetorno("https://claude.ai/cb?origen=app", { code: "abc", state: null });
    expect(new URL(u).searchParams.get("origen")).toBe("app");
  });
});
