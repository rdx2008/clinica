import { test } from "node:test";
import assert from "node:assert/strict";
import { mapHeaders, parseCsv, parseDateFlexible } from "../src/lib/csv.ts";

test("CSV com ponto e vírgula, BOM e CRLF", () => {
  const r = parseCsv("﻿Nome;Telefone\r\nMaria;11 98765-4321\r\nJoão;\r\n");
  assert.deepEqual(r.headers, ["Nome", "Telefone"]);
  assert.deepEqual(r.rows, [["Maria", "11 98765-4321"], ["João", ""]]);
});

test("CSV com vírgula, aspas e vírgula dentro do campo", () => {
  const r = parseCsv('nome,origem\n"Silva, Ana","Indicação ""amiga"""\n');
  assert.deepEqual(r.rows, [["Silva, Ana", 'Indicação "amiga"']]);
});

test("CSV ignora linhas em branco e quebra de linha dentro de aspas", () => {
  const r = parseCsv('a,b\n\n"x\ny",z\n');
  assert.deepEqual(r.rows, [["x\ny", "z"]]);
});

test("mapeamento de colunas aceita apelidos com acento e caixa", () => {
  const m = mapHeaders(["Nome Completo", "Celular", "E-mail", "Data de Nascimento", "CPF", "Como conheceu", "Tags", "Outra"]);
  assert.deepEqual(m, { nome: 0, telefone: 1, email: 2, nascimento: 3, cpf: 4, origem: 5, etiquetas: 6 });
});

test("datas: formatos aceitos e inválidas", () => {
  assert.equal(parseDateFlexible("25/12/1990"), "1990-12-25");
  assert.equal(parseDateFlexible("5-3-2001"), "2001-03-05");
  assert.equal(parseDateFlexible("1990-12-25"), "1990-12-25");
  assert.equal(parseDateFlexible("31/02/2000"), null);
  assert.equal(parseDateFlexible("abc"), null);
  assert.equal(parseDateFlexible("01/01/1800"), null);
});
