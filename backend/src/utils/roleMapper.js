
const mapDatabaseRoleToApiRole = (role) => {
  if (role === 'admin') {
    return 'owner';
  }

  return role;
};

module.exports = { mapDatabaseRoleToApiRole };
