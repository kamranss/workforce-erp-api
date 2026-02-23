const ROLE_SUPER_ADMIN = 'superAdmin';
const ROLE_ADMIN = 'admin';
const ROLE_USER = 'user';

function isSuperAdmin(role) {
  return role === ROLE_SUPER_ADMIN;
}

function isAdmin(role) {
  return role === ROLE_ADMIN;
}

function isAdminOrSuperAdmin(role) {
  return isAdmin(role) || isSuperAdmin(role);
}

module.exports = {
  ROLE_SUPER_ADMIN,
  ROLE_ADMIN,
  ROLE_USER,
  isSuperAdmin,
  isAdmin,
  isAdminOrSuperAdmin
};
