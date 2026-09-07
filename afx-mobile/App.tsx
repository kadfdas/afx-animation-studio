/* ============================================================
 * App.tsx — React Native 移动端入口
 * 导航：项目列表 → 编辑器
 * ============================================================ */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useAppStore } from './src/store/app-store';
import { cloud } from './src/services/cloud-sync';
import Stage from './src/components/Stage';
import CloudPanel from './src/components/CloudPanel';

type Screen = 'cloud' | 'editor';

export default function App() {
  const [screen, setScreen] = useState<Screen>('cloud');
  const { scene, t, playing, play, pause, stop } = useAppStore();

  const openProject = async (id) => {
    try {
      const r = await cloud.getProject(id);
      useAppStore.getState().setScene(r.data);
      useAppStore.getState().setScene(JSON.parse(JSON.stringify(r.data))); // normalize
      setScreen('editor');
    } catch (e) { alert(e.message); }
  };

  if (screen === 'cloud') {
    return React.createElement(View, { style: styles.container },
      React.createElement(StatusBar, { barStyle: 'light-content' }),
      React.createElement(CloudPanel, { onOpenProject: openProject })
    );
  }

  return React.createElement(View, { style: styles.container },
    React.createElement(StatusBar, { barStyle: 'light-content' }),
    React.createElement(View, { style: styles.topbar },
      React.createElement(TouchableOpacity, { onPress: () => setScreen('cloud') },
        React.createElement(Text, { style: styles.btn }, '← 项目')
      ),
      React.createElement(Text, { style: styles.title }, scene.meta.name),
      React.createElement(Text, { style: styles.time }, t.toFixed(1) + 's / ' + scene.meta.duration + 's')
    ),
    React.createElement(Stage, null),
    React.createElement(View, { style: styles.transport },
      React.createElement(TouchableOpacity, { style: styles.playBtn, onPress: playing ? pause : play },
        React.createElement(Text, { style: styles.playText }, playing ? '⏸' : '▶')
      ),
      React.createElement(TouchableOpacity, { onPress: stop },
        React.createElement(Text, { style: styles.btn }, '⏹')
      )
    )
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16181d' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingTop: 44, backgroundColor: '#1e2128', borderBottomWidth: 1, borderBottomColor: '#343945' },
  title: { fontSize: 14, color: '#d7dae0', fontWeight: '600' },
  time: { fontSize: 12, color: '#8a919e' },
  btn: { color: '#4f9cff', fontSize: 14, padding: 4 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16, backgroundColor: '#1e2128', borderTopWidth: 1, borderTopColor: '#343945' },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f9cff', alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#fff', fontSize: 24 },
});
