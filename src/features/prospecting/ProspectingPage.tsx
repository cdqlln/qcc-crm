import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { BattleTab } from './BattleTab';
import { SignalsTab } from './SignalsTab';
import { WhitespaceTab } from './WhitespaceTab';
import { CampaignsTab } from './CampaignsTab';
import { IcpTab } from './IcpTab';
import { StatsTab } from './StatsTab';

// 商机开拓管理及分析（《商机开拓管理办法》QCC-SALES-DEV-2026-005）
// 三大引擎：作战名单 / 信号雷达 / 白空间矩阵 + 战役机制 + 第十四条指标体系
export function ProspectingPage() {
  const [tab, setTab] = useState('battle');
  return (
    <div>
      <PageHeader
        title="商机开拓"
        description="吃自己的狗粮：作战名单 · 信号雷达 · 白空间矩阵 · 开拓战役 · 指标分析"
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'battle', label: '作战名单' },
          { key: 'signals', label: '信号雷达' },
          { key: 'whitespace', label: '白空间矩阵' },
          { key: 'campaigns', label: '开拓战役' },
          { key: 'icp', label: 'ICP · TAM' },
          { key: 'stats', label: '开拓分析' },
        ]}
      />
      {tab === 'battle' && <BattleTab />}
      {tab === 'signals' && <SignalsTab />}
      {tab === 'whitespace' && <WhitespaceTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'icp' && <IcpTab />}
      {tab === 'stats' && <StatsTab />}
    </div>
  );
}
