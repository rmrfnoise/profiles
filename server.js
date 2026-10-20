"use strict";

const path = require("node:path");
const express = require("express");
const db = require("./database");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

const PERSON_COLUMNS = `
  id, name, gender, birth_date, phone, email, id_card, note,
  contacts, avatar, socials, addresses, interests, custom_fields
`;

const CUSTOM_FIELD_TARGETS = new Set([
  "basic",
  "contact",
  "address",
  "interests",
  "standalone"
]);

function cleanString(value, maxLength = 2000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function digitsOnly(value, maxLength = 11) {
  return cleanString(value, 64).replace(/\D/g, "").slice(0, maxLength);
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date <= today;
}

function isValidMobile(value) {
  return /^1[3-9]\d{9}$/.test(String(value || "").trim());
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

function isValidChineseIdCard(value) {
  const id = String(value || "").trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(id)) return false;
  const year = Number(id.slice(6, 10));
  const month = Number(id.slice(10, 12));
  const day = Number(id.slice(12, 14));
  if (!isValidCalendarDate(year, month, day)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = weights.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
  return codes[sum % 11] === id[17];
}

function isValidIsoBirthDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return false;
  return isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function validatePerson(person) {
  if (!person.name) return "请填写姓名以继续。";
  if (person.birthDate && !isValidIsoBirthDate(person.birthDate)) {
    return "请填写正确的出生日期。";
  }
  if (person.idCard && !isValidChineseIdCard(person.idCard)) {
    return "请填写正确的身份证号。";
  }
  if (person.contacts.some((contact) => contact.type === "phone" && !isValidMobile(contact.value))) {
    return "请填写正确的手机号。";
  }
  if (person.contacts.some((contact) => contact.type === "email" && !isValidEmail(contact.value))) {
    return "请填写正确的邮箱。";
  }
  return "";
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeContacts(value) {
  return parseJsonArray(value)
    .filter((item) => item && typeof item === "object")
    .slice(0, 100)
    .map((item, index) => {
      const type = item.type === "email" ? "email" : "phone";
      const value = type === "email"
        ? cleanString(item.value, 320)
        : digitsOnly(item.value);
      return {
        id: cleanString(item.id, 80) || `contact-${Date.now().toString(36)}-${index}`,
        type,
        value,
        note: cleanString(item.note, 80)
      };
    })
    .filter((item) => item.value);
}

function primaryContactValue(contacts, type) {
  return (contacts || []).find((contact) => contact.type === type)?.value || "";
}

function sanitizeSocials(value) {
  return parseJsonArray(value)
    .filter((item) => item && typeof item === "object")
    .slice(0, 100)
    .map((item) => ({
      platform: cleanString(item.platform, 80),
      handle: cleanString(item.handle, 160),
      note: cleanString(item.note, 200)
    }))
    .filter((item) => item.platform || item.handle);
}

function sanitizeAddresses(value) {
  return parseJsonArray(value)
    .filter((item) => item && typeof item === "object")
    .slice(0, 100)
    .map((item) => ({
      kind: cleanString(item.kind, 60) || "住址",
      note: cleanString(item.note, 200),
      text: cleanString(item.text, 500)
    }))
    .filter((item) => item.text);
}

function sanitizeInterests(value) {
  return parseJsonArray(value)
    .map((item) => cleanString(item, 80))
    .filter(Boolean)
    .slice(0, 100);
}

function sanitizeCustomFields(value) {
  return parseJsonArray(value)
    .filter((item) => item && typeof item === "object")
    .slice(0, 100)
    .map((item, index) => ({
      id: cleanString(item.id, 80) || `cf-${Date.now().toString(36)}-${index}`,
      name: cleanString(item.name, 80),
      value: cleanString(item.value, 1000),
      target: CUSTOM_FIELD_TARGETS.has(item.target) ? item.target : "standalone"
    }))
    .filter((item) => item.name || item.value);
}

function sanitizeAvatar(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) return null;
  return value;
}

function normalizePersonInput(input = {}, fallback = {}) {
  const pick = (key) => (Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback[key]);
  const name = cleanString(pick("name"), 200);
  let contacts = sanitizeContacts(pick("contacts"));

  if (!contacts.length) {
    const phone = digitsOnly(pick("phone"));
    const email = cleanString(pick("email"), 320);
    if (phone) {
      contacts.push({
        id: `contact-phone-${Date.now().toString(36)}`,
        type: "phone",
        value: phone,
        note: "主号"
      });
    }
    if (email) {
      contacts.push({
        id: `contact-email-${Date.now().toString(36)}`,
        type: "email",
        value: email,
        note: "常用"
      });
    }
  }

  return {
    name,
    gender: cleanString(pick("gender"), 30),
    birthDate: cleanString(pick("birthDate"), 30),
    phone: primaryContactValue(contacts, "phone"),
    email: primaryContactValue(contacts, "email"),
    idCard: cleanString(pick("idCard"), 120).toUpperCase(),
    note: cleanString(pick("note"), 10000),
    contacts,
    avatar: sanitizeAvatar(pick("avatar")),
    socials: sanitizeSocials(pick("socials")),
    addresses: sanitizeAddresses(pick("addresses")),
    interests: sanitizeInterests(pick("interests")),
    customFields: sanitizeCustomFields(pick("customFields"))
  };
}

function rowToPerson(row) {
  if (!row) return null;
  let contacts = sanitizeContacts(row.contacts);
  if (!contacts.length && (row.phone || row.email)) {
    if (row.phone) {
      contacts.push({ id: `contact-phone-${row.id}`, type: "phone", value: row.phone, note: "主号" });
    }
    if (row.email) {
      contacts.push({ id: `contact-email-${row.id}`, type: "email", value: row.email, note: "常用" });
    }
  }
  const socials = sanitizeSocials(row.socials);
  const addresses = sanitizeAddresses(row.addresses);
  return {
    id: String(row.id),
    name: row.name || "",
    gender: row.gender || "",
    birthDate: row.birth_date || "",
    phone: primaryContactValue(contacts, "phone"),
    email: primaryContactValue(contacts, "email"),
    idCard: row.id_card || "",
    note: row.note || "",
    contacts,
    avatar: row.avatar || null,
    socials,
    addresses,
    interests: parseJsonArray(row.interests),
    customFields: parseJsonArray(row.custom_fields)
  };
}

function rowToRelation(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    type: row.type,
    a: String(row.person_a_id),
    b: String(row.person_b_id),
    label: row.label || "",
    forwardLabel: row.forward_label || "",
    reverseLabel: row.reverse_label || ""
  };
}

function getPersonRow(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  return db.prepare(`SELECT ${PERSON_COLUMNS} FROM people WHERE id = ?`).get(numericId);
}

function getRelationRow(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  return db.prepare("SELECT * FROM relations WHERE id = ?").get(numericId);
}

function relationPairExists(personAId, personBId, excludedId = null) {
  const row = db.prepare(`
    SELECT id FROM relations
    WHERE (
      (person_a_id = ? AND person_b_id = ?)
      OR
      (person_a_id = ? AND person_b_id = ?)
    )
    ${excludedId ? "AND id <> ?" : ""}
    LIMIT 1
  `).get(
    personAId,
    personBId,
    personBId,
    personAId,
    ...(excludedId ? [excludedId] : [])
  );
  return Boolean(row);
}

const insertPerson = db.prepare(`
  INSERT INTO people (
    name, gender, birth_date, phone, email, id_card, note,
    contacts, avatar, socials, addresses, interests, custom_fields
  ) VALUES (
    @name, @gender, @birthDate, @phone, @email, @idCard, @note,
    @contacts, @avatar, @socials, @addresses, @interests, @customFields
  )
`);

const updatePerson = db.prepare(`
  UPDATE people SET
    name = @name,
    gender = @gender,
    birth_date = @birthDate,
    phone = @phone,
    email = @email,
    id_card = @idCard,
    note = @note,
    contacts = @contacts,
    avatar = @avatar,
    socials = @socials,
    addresses = @addresses,
    interests = @interests,
    custom_fields = @customFields
  WHERE id = @id
`);

function personDbParams(person, id = null) {
  return {
    ...(id ? { id } : {}),
    name: person.name,
    gender: person.gender,
    birthDate: person.birthDate,
    phone: person.phone,
    email: person.email,
    idCard: person.idCard,
    note: person.note,
    contacts: JSON.stringify(person.contacts),
    avatar: person.avatar,
    socials: JSON.stringify(person.socials),
    addresses: JSON.stringify(person.addresses),
    interests: JSON.stringify(person.interests),
    customFields: JSON.stringify(person.customFields)
  };
}

/* ------------------------------------------------------------------ */
/* People API                                                         */
/* ------------------------------------------------------------------ */

app.get("/api/people", (req, res) => {
  const rows = db.prepare(`SELECT ${PERSON_COLUMNS} FROM people ORDER BY id ASC`).all();
  res.json(rows.map(rowToPerson));
});

app.post("/api/people", (req, res) => {
  try {
    const person = normalizePersonInput(req.body);
    const validationError = validatePerson(person);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const result = insertPerson.run(personDbParams(person));
    const created = getPersonRow(result.lastInsertRowid);
    res.status(201).json(rowToPerson(created));
  } catch (error) {
    console.error("POST /api/people failed:", error);
    res.status(500).json({ error: "创建失败，请稍后重试。" });
  }
});

app.put("/api/people/:id", (req, res) => {
  try {
    const existing = getPersonRow(req.params.id);
    if (!existing) return res.status(404).json({ error: "未找到该档案。" });

    const current = rowToPerson(existing);
    const person = normalizePersonInput(req.body, current);
    const validationError = validatePerson(person);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    updatePerson.run(personDbParams(person, existing.id));
    const updated = getPersonRow(existing.id);
    res.json(rowToPerson(updated));
  } catch (error) {
    console.error("PUT /api/people/:id failed:", error);
    res.status(500).json({ error: "保存失败，请稍后重试。" });
  }
});

app.delete("/api/people/:id", (req, res) => {
  try {
    const existing = getPersonRow(req.params.id);
    if (!existing) return res.status(404).json({ error: "未找到该档案。" });

    const deleteRelations = db.prepare(
      "DELETE FROM relations WHERE person_a_id = ? OR person_b_id = ?"
    );
    const deletePerson = db.prepare("DELETE FROM people WHERE id = ?");
    const removePerson = db.transaction((personId) => {
      deleteRelations.run(personId, personId);
      deletePerson.run(personId);
    });
    removePerson(existing.id);
    res.json({ ok: true, id: String(existing.id) });
  } catch (error) {
    console.error("DELETE /api/people/:id failed:", error);
    res.status(500).json({ error: "删除失败，请稍后重试。" });
  }
});

/* ------------------------------------------------------------------ */
/* Relations API                                                      */
/* ------------------------------------------------------------------ */

app.get("/api/relations", (req, res) => {
  const rows = db.prepare("SELECT * FROM relations ORDER BY id ASC").all();
  res.json(rows.map(rowToRelation));
});

app.post("/api/relations", (req, res) => {
  try {
    const type = req.body?.type === "role" ? "role" : "peer";
    const personAId = Number(req.body?.a);
    const personBId = Number(req.body?.b);

    if (!Number.isInteger(personAId) || !Number.isInteger(personBId)) {
      return res.status(400).json({ error: "请选择要关联的档案。" });
    }
    if (personAId === personBId) {
      return res.status(400).json({ error: "不能与同一档案建立关系。" });
    }
    if (!getPersonRow(personAId) || !getPersonRow(personBId)) {
      return res.status(404).json({ error: "目标档案不存在。" });
    }
    if (relationPairExists(personAId, personBId)) {
      return res.status(409).json({ error: "这段关系已存在。" });
    }

    let label = null;
    let forwardLabel = null;
    let reverseLabel = null;
    if (type === "peer") {
      label = cleanString(req.body?.label, 80);
      if (!label) return res.status(400).json({ error: "请输入关系称呼以继续。" });
    } else {
      forwardLabel = cleanString(req.body?.forwardLabel, 80);
      reverseLabel = cleanString(req.body?.reverseLabel, 80);
      if (!forwardLabel || !reverseLabel) {
        return res.status(400).json({ error: "请输入正向与反向称呼以继续。" });
      }
    }

    const result = db.prepare(`
      INSERT INTO relations (
        type, person_a_id, person_b_id, label, forward_label, reverse_label
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(type, personAId, personBId, label, forwardLabel, reverseLabel);

    res.status(201).json(rowToRelation(getRelationRow(result.lastInsertRowid)));
  } catch (error) {
    console.error("POST /api/relations failed:", error);
    res.status(500).json({ error: "新建关系失败，请稍后重试。" });
  }
});

app.delete("/api/relations/:id", (req, res) => {
  try {
    const existing = getRelationRow(req.params.id);
    if (!existing) return res.status(404).json({ error: "未找到该关系。" });
    db.prepare("DELETE FROM relations WHERE id = ?").run(existing.id);
    res.json({ ok: true, id: String(existing.id) });
  } catch (error) {
    console.error("DELETE /api/relations/:id failed:", error);
    res.status(500).json({ error: "删除关系失败，请稍后重试。" });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "接口不存在。" });
});

const publicDir = path.join(__dirname, "public");
app.use("/fonts", express.static(path.join(publicDir, "fonts"), { maxAge: "30d", immutable: true }));
app.use(express.static(publicDir));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "请求内容格式不正确。" });
  }
  console.error("Unhandled server error:", error);
  res.status(500).json({ error: "服务暂时不可用，请稍后重试。" });
});

const server = app.listen(PORT, () => {
  console.log(`Profiles archive running at http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
