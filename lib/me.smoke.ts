import assert from "node:assert/strict";
import { validateEmailInput, validatePasswordInput } from "@/lib/me";

assert.equal(validatePasswordInput({ currentPassword: "", newPassword: "" }), "请填写当前密码");
assert.equal(validatePasswordInput({ currentPassword: "", newPassword: "" }, false), "请填写新密码");
assert.equal(validatePasswordInput({ currentPassword: "", newPassword: "newpass" }, false), null);
assert.equal(
  validatePasswordInput({ currentPassword: "123456", newPassword: "123456" }),
  "新密码不能和当前密码相同",
);
assert.equal(validatePasswordInput({ currentPassword: "oldpass", newPassword: "newpass" }), null);

assert.equal(validateEmailInput({ newEmail: "" }, "old@example.com"), "请填写新邮箱");
assert.equal(validateEmailInput({ newEmail: "bad-email" }, "old@example.com"), "请输入有效邮箱");
assert.equal(
  validateEmailInput({ newEmail: "OLD@example.com" }, "old@example.com"),
  "新邮箱不能和当前邮箱相同",
);
assert.equal(validateEmailInput({ newEmail: "new@example.com" }, "old@example.com"), null);

console.log("me.smoke passed");
