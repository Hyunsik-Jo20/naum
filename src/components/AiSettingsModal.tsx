// 보건교사용 AI 설정창 — 제공자/API 키/모델 입력(병명·처치 추천에 사용).
//  키는 이 브라우저 localStorage 에만 저장. 호출 시 학생 PII는 전송하지 않음(증상만).
import { useState } from 'react'
import { AI_PROVIDERS, loadAiConfig, saveAiConfig, DEFAULT_TRIAGE_PROMPT, type AiConfig, type AiProvider } from '../data/ai'

export default function AiSettingsModal({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<AiConfig>(() => loadAiConfig())
  const info = AI_PROVIDERS.find((p) => p.id === cfg.provider)!

  function setProvider(id: AiProvider) {
    const p = AI_PROVIDERS.find((x) => x.id === id)!
    setCfg((c) => ({ ...c, provider: id, model: p.defaultModel || c.model }))
  }
  function save() {
    saveAiConfig(cfg)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <i className="ti ti-robot" style={{ verticalAlign: -2 }} aria-hidden="true" /> AI 설정
          </h3>
          <button className="x" onClick={onClose} aria-label="닫기"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6 }}>
          증상으로 병명·처치를 추천받습니다. 키는 <b>이 기기에만</b> 저장되고, AI에는 <b>증상만</b> 보냅니다(이름·반·번호 미전송).
        </p>

        <label className="login-field">제공자
          <select value={cfg.provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
            {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="login-field">API 키
          <input type="password" value={cfg.apiKey} placeholder={info.keyHint} onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))} />
        </label>
        <label className="login-field">모델
          <input value={cfg.model} placeholder={info.defaultModel || '모델명'} onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))} />
        </label>
        {info.needsBaseUrl && (
          <label className="login-field">Base URL
            <input value={cfg.baseUrl ?? ''} placeholder="https://host/v1" onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))} />
          </label>
        )}

        <label className="login-field">
          <span className="row between" style={{ alignItems: 'center' }}>
            <span>추천 프롬프트 (역할·판단 기준)</span>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setCfg((c) => ({ ...c, triagePrompt: DEFAULT_TRIAGE_PROMPT }))}
              title="기본값으로 되돌리기"
            >
              <i className="ti ti-rotate" aria-hidden="true" /> 기본값
            </button>
          </span>
          <textarea
            rows={6}
            value={cfg.triagePrompt}
            onChange={(e) => setCfg((c) => ({ ...c, triagePrompt: e.target.value }))}
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        </label>
        <p className="muted" style={{ fontSize: 11, margin: '-4px 0 0', lineHeight: 1.6 }}>
          증상과 <b>보건교사가 입력한 기타/특이사항</b>을 함께 보고 추천합니다. 출력 형식(JSON)은 자동 고정되어 수정과 무관하게 안전합니다.
        </p>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={save}><i className="ti ti-device-floppy" aria-hidden="true" /> 저장</button>
        </div>
      </div>
    </div>
  )
}
