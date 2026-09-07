/* ============================================================
 * components/CloudPanel.js — 云同步 UI（登录 + 项目列表）
 * ============================================================ */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { cloud } from '../services/cloud-sync';
import { useAppStore } from '../store/app-store';

export default function CloudPanel({ onOpenProject }) {
  const { cloudConfig } = useAppStore();
  const [serverUrl, setServerUrl] = useState(cloudConfig.serverUrl || 'http://127.0.0.1:3000');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isLoggedIn = !!cloudConfig.token;

  const handleAuth = async () => {
    setLoading(true);
    setError('');
    try {
      cloudConfig.serverUrl = serverUrl.replace(/\/+$/, '');
      useAppStore.getState().setCloudConfig(cloudConfig);
      if (isRegister) await cloud.register(username, password);
      else await cloud.login(username, password);
      loadProjects();
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const loadProjects = async () => {
    try {
      const list = await cloud.listProjects();
      setProjects(list);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { if (isLoggedIn) loadProjects(); }, [isLoggedIn]);

  if (!isLoggedIn) {
    return React.createElement(View, { style: styles.container },
      React.createElement(Text, { style: styles.title }, '☁️ 云同步'),
      React.createElement(TextInput, {
        style: styles.input, placeholder: '服务器地址',
        value: serverUrl, onChangeText: setServerUrl
      }),
      React.createElement(TextInput, {
        style: styles.input, placeholder: '用户名',
        value: username, onChangeText: setUsername
      }),
      React.createElement(TextInput, {
        style: styles.input, placeholder: '密码',
        secureTextEntry: true,
        value: password, onChangeText: setPassword
      }),
      React.createElement(TouchableOpacity, { style: styles.button, onPress: handleAuth, disabled: loading },
        React.createElement(Text, { style: styles.buttonText }, loading ? '请稍候...' : isRegister ? '注册' : '登录')
      ),
      React.createElement(TouchableOpacity, { onPress: () => setIsRegister(!isRegister) },
        React.createElement(Text, { style: styles.switchText }, isRegister ? '切换到登录' : '切换到注册')
      ),
      error ? React.createElement(Text, { style: styles.error }, error) : null
    );
  }

  return React.createElement(View, { style: styles.container },
    React.createElement(View, { style: styles.header },
      React.createElement(Text, { style: styles.title }, '☁️ ' + (cloudConfig.user?.username || '')),
      React.createElement(TouchableOpacity, { onPress: () => cloud.logout() },
        React.createElement(Text, { style: styles.logout }, '退出')
      )
    ),
    React.createElement(FlatList, {
      data: projects,
      keyExtractor: item => item.id,
      renderItem: ({ item }) => React.createElement(TouchableOpacity, {
        style: styles.projectItem,
        onPress: () => onOpenProject && onOpenProject(item.id)
      },
        React.createElement(Text, { style: styles.projectName }, item.name),
        React.createElement(Text, { style: styles.projectMeta }, 'v' + item.version + ' · ' + new Date(item.updated_at).toLocaleString())
      )
    })
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#1e2128' },
  title: { fontSize: 16, fontWeight: '600', color: '#d7dae0', marginBottom: 12 },
  input: { backgroundColor: '#262a33', color: '#d7dae0', padding: 10, borderRadius: 5, marginBottom: 8 },
  button: { backgroundColor: '#4f9cff', padding: 12, borderRadius: 5, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  switchText: { color: '#8a919e', fontSize: 12, textAlign: 'center', marginTop: 10 },
  error: { color: '#ff6b6b', fontSize: 12, marginTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logout: { color: '#ff6b6b', fontSize: 12 },
  projectItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#343945' },
  projectName: { fontSize: 14, color: '#d7dae0' },
  projectMeta: { fontSize: 10, color: '#8a919e', marginTop: 4 },
});
