import { useState, useEffect } from 'react';
import http from '../../services/http';

interface Usuario {
  id: string;
  username: string;
  nombre_completo: string | null;
  email: string | null;
  activo: boolean;
  created_at: string | null;
  ultimo_login: string | null;
  rol_id: string | null;
  rol_nombre: string | null;
}

interface NuevoUsuario {
  username: string;
  password: string;
  nombre_completo: string;
  email: string;
  rol_id: string;
  tiendas_asignadas: string[];
}

interface Rol {
  id: string;
  nombre: string;
  descripcion: string;
}

interface Ubicacion {
  ubicacion_id: string;
  nombre: string;
}

const ROLES: Rol[] = [
  { id: 'visualizador', nombre: 'Visualizador', descripcion: 'Solo lectura de dashboards' },
  { id: 'gerente_tienda', nombre: 'Gerente de Tienda', descripcion: 'Gestión de tiendas asignadas' },
  { id: 'gestor_abastecimiento', nombre: 'Gestor de Abastecimiento', descripcion: 'Creación de pedidos para todas las tiendas' },
  { id: 'gerente_general', nombre: 'Gerente General', descripcion: 'Visualización y pedidos de todas las tiendas' },
  { id: 'super_admin', nombre: 'Super Admin', descripcion: 'Acceso completo al sistema' }
];

export default function UsuariosAdmin() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [editRolId, setEditRolId] = useState('');
  const [editTiendasAsignadas, setEditTiendasAsignadas] = useState<string[]>([]);
  const [nuevoUsuario, setNuevoUsuario] = useState<NuevoUsuario>({
    username: '',
    password: '',
    nombre_completo: '',
    email: '',
    rol_id: 'gestor_abastecimiento',
    tiendas_asignadas: []
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadUsuarios();
    loadUbicaciones();
  }, []);

  const loadUsuarios = async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/auth/users');
      setUsuarios(response.data);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      setError('Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  };

  const loadUbicaciones = async () => {
    try {
      const response = await http.get('/ubicaciones');
      setUbicaciones(response.data);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
    }
  };

  const handleCreateUser = async () => {
    try {
      setSaving(true);
      setError(null);
      await http.post('/api/auth/register', nuevoUsuario);
      setSuccess(`Usuario "${nuevoUsuario.username}" creado exitosamente`);
      setShowCreateModal(false);
      setNuevoUsuario({
        username: '',
        password: '',
        nombre_completo: '',
        email: '',
        rol_id: 'gestor_abastecimiento',
        tiendas_asignadas: []
      });
      await loadUsuarios();
    } catch (err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Error creando usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      setError(null);
      await http.put(`/api/auth/users/${selectedUser.id}/password`, {
        new_password: newPassword
      });
      setSuccess(`Contraseña de "${selectedUser.username}" actualizada`);
      setShowPasswordModal(false);
      setNewPassword('');
      setSelectedUser(null);
    } catch (err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Error cambiando contraseña');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      setError(null);
      await http.put(`/api/auth/users/${selectedUser.id}/role`, {
        rol_id: editRolId,
        tiendas_asignadas: editRolId === 'gerente_tienda' ? editTiendasAsignadas : []
      });
      setSuccess(`Rol de "${selectedUser.username}" actualizado`);
      setShowEditRoleModal(false);
      setSelectedUser(null);
      setEditRolId('');
      setEditTiendasAsignadas([]);
      await loadUsuarios();
    } catch (err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Error actualizando rol');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      setError(null);
      await http.delete(`/api/auth/users/${selectedUser.id}`);
      setSuccess(`Usuario "${selectedUser.username}" eliminado`);
      setShowDeleteModal(false);
      setSelectedUser(null);
      await loadUsuarios();
    } catch (err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Error eliminando usuario');
    } finally {
      setSaving(false);
    }
  };

  const toggleTienda = (ubicacionId: string, isNewUser: boolean = false) => {
    if (isNewUser) {
      const current = nuevoUsuario.tiendas_asignadas;
      setNuevoUsuario({
        ...nuevoUsuario,
        tiendas_asignadas: current.includes(ubicacionId)
          ? current.filter(id => id !== ubicacionId)
          : [...current, ubicacionId]
      });
    } else {
      setEditTiendasAsignadas(prev =>
        prev.includes(ubicacionId)
          ? prev.filter(id => id !== ubicacionId)
          : [...prev, ubicacionId]
      );
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRolBadgeColor = (rolId: string | null) => {
    switch (rolId) {
      case 'super_admin': return 'bg-purple-100 text-purple-800';
      case 'gerente_general': return 'bg-blue-100 text-blue-800';
      case 'gestor_abastecimiento': return 'bg-green-100 text-green-800';
      case 'gerente_tienda': return 'bg-yellow-100 text-yellow-800';
      case 'visualizador': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Auto-hide messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administrar Usuarios</h1>
          <p className="text-gray-500 mt-1">Gestiona los usuarios del sistema</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Usuario
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Creado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Último Login
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className={!usuario.activo ? 'bg-gray-50 opacity-60' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium">
                        {usuario.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{usuario.username}</div>
                      <div className="text-sm text-gray-500">{usuario.nombre_completo || '-'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {usuario.email || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRolBadgeColor(usuario.rol_id)}`}>
                    {usuario.rol_nombre || 'Sin rol'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    usuario.activo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(usuario.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(usuario.ultimo_login)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => {
                      setSelectedUser(usuario);
                      setEditRolId(usuario.rol_id || 'visualizador');
                      setEditTiendasAsignadas([]);
                      setShowEditRoleModal(true);
                    }}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                    title="Editar rol"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedUser(usuario);
                      setShowPasswordModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                    title="Cambiar contraseña"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </button>
                  {usuario.activo && (
                    <button
                      onClick={() => {
                        setSelectedUser(usuario);
                        setShowDeleteModal(true);
                      }}
                      className="text-red-600 hover:text-red-900"
                      title="Eliminar usuario"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Crear Nuevo Usuario</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={nuevoUsuario.username}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="usuario"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={nuevoUsuario.password}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="********"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  value={nuevoUsuario.nombre_completo}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre_completo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={nuevoUsuario.email}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="usuario@empresa.com"
                />
              </div>

              {/* Rol Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={nuevoUsuario.rol_id}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol_id: e.target.value, tiendas_asignadas: [] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {ROLES.map(rol => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre} - {rol.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tiendas Asignadas - Solo visible para Gerente de Tienda */}
              {nuevoUsuario.rol_id === 'gerente_tienda' && (
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tiendas Asignadas (Requerido para Gerente de Tienda)
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {ubicaciones.map(ubicacion => (
                      <label key={ubicacion.ubicacion_id} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={nuevoUsuario.tiendas_asignadas.includes(ubicacion.ubicacion_id)}
                          onChange={() => toggleTienda(ubicacion.ubicacion_id, true)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">{ubicacion.nombre}</span>
                      </label>
                    ))}
                  </div>
                  {nuevoUsuario.tiendas_asignadas.length === 0 && (
                    <p className="text-sm text-red-600 mt-1">Debes asignar al menos una tienda</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNuevoUsuario({
                    username: '',
                    password: '',
                    nombre_completo: '',
                    email: '',
                    rol_id: 'gestor_abastecimiento',
                    tiendas_asignadas: []
                  });
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateUser}
                disabled={
                  saving ||
                  !nuevoUsuario.username ||
                  !nuevoUsuario.password ||
                  (nuevoUsuario.rol_id === 'gerente_tienda' && nuevoUsuario.tiendas_asignadas.length === 0)
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {showEditRoleModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Editar Rol de Usuario</h2>
            <p className="text-gray-600 mb-4">
              Modificar rol de <strong>{selectedUser.username}</strong>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={editRolId}
                  onChange={(e) => {
                    setEditRolId(e.target.value);
                    if (e.target.value !== 'gerente_tienda') {
                      setEditTiendasAsignadas([]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {ROLES.map(rol => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre} - {rol.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tiendas Asignadas - Solo visible para Gerente de Tienda */}
              {editRolId === 'gerente_tienda' && (
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tiendas Asignadas (Requerido para Gerente de Tienda)
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {ubicaciones.map(ubicacion => (
                      <label key={ubicacion.ubicacion_id} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editTiendasAsignadas.includes(ubicacion.ubicacion_id)}
                          onChange={() => toggleTienda(ubicacion.ubicacion_id, false)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">{ubicacion.nombre}</span>
                      </label>
                    ))}
                  </div>
                  {editTiendasAsignadas.length === 0 && (
                    <p className="text-sm text-red-600 mt-1">Debes asignar al menos una tienda</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditRoleModal(false);
                  setSelectedUser(null);
                  setEditRolId('');
                  setEditTiendasAsignadas([]);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateRole}
                disabled={
                  saving ||
                  (editRolId === 'gerente_tienda' && editTiendasAsignadas.length === 0)
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Actualizar Rol'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Cambiar Contraseña</h2>
            <p className="text-gray-600 mb-4">
              Cambiar contraseña de <strong>{selectedUser.username}</strong>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="********"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setNewPassword('');
                  setSelectedUser(null);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangePassword}
                disabled={saving || !newPassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Cambiar Contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-600">Eliminar Usuario</h2>
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que deseas eliminar al usuario <strong>{selectedUser.username}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              El usuario será desactivado y no podrá iniciar sesión.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
