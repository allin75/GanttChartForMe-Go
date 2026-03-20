import React from 'react';
import { WeChatBindAttempt, WeChatBindingInfo } from '../types';

interface WeChatBindingCardProps {
  accountLabel: string;
  statusText: string;
  binding?: WeChatBindingInfo;
  pendingAttempt?: WeChatBindAttempt;
  message?: string;
  loading?: boolean;
  bindOpenId: string;
  bindDisplayName: string;
  bindAvatarUrl: string;
  onBindOpenIdChange: (value: string) => void;
  onBindDisplayNameChange: (value: string) => void;
  onBindAvatarUrlChange: (value: string) => void;
  onStartBinding: () => Promise<void> | void;
  onConfirmBinding: () => Promise<void> | void;
  onRemoveBinding: () => Promise<void> | void;
}

const WeChatBindingCard: React.FC<WeChatBindingCardProps> = ({
  accountLabel,
  statusText,
  binding,
  pendingAttempt,
  message,
  loading = false,
  bindOpenId,
  bindDisplayName,
  bindAvatarUrl,
  onBindOpenIdChange,
  onBindDisplayNameChange,
  onBindAvatarUrlChange,
  onStartBinding,
  onConfirmBinding,
  onRemoveBinding,
}) => {
  const canConfirm = Boolean(pendingAttempt && bindOpenId.trim());

  return (
    <section className="binding-card">
      <div className="binding-card-header">
        <div>
          <span className="binding-card-eyebrow">账户中心</span>
          <h2 className="binding-card-title">微信绑定入口</h2>
        </div>
        <span className="binding-status-pill">{statusText}</span>
      </div>

       {message && <div className="binding-inline-note">{message}</div>}

      <div className="binding-meta-grid">
        <div className="binding-meta-item">
          <span className="binding-meta-label">当前账户</span>
          <strong className="binding-meta-value">{accountLabel}</strong>
        </div>
        <div className="binding-meta-item">
          <span className="binding-meta-label">绑定状态</span>
          <strong className="binding-meta-value">{statusText}</strong>
        </div>
      </div>

      {binding && (
        <div className="binding-detail-card">
          <div className="binding-detail-row">
            <span>微信昵称</span>
            <strong>{binding.display_name || '未命名微信用户'}</strong>
          </div>
          <div className="binding-detail-row">
            <span>OpenID</span>
            <strong>{binding.open_id_masked}</strong>
          </div>
          <div className="binding-detail-row">
            <span>绑定时间</span>
            <strong>{binding.bound_at}</strong>
          </div>
        </div>
      )}

      {pendingAttempt && (
        <div className="binding-attempt-card">
          <div className="binding-attempt-header">
            <strong>绑定进行中</strong>
            <span className="binding-attempt-status">{pendingAttempt.status}</span>
          </div>
          <div className="binding-attempt-grid">
            <div className="binding-meta-item">
              <span className="binding-meta-label">绑定口令</span>
              <strong className="binding-meta-value binding-code-value">{pendingAttempt.bind_token}</strong>
            </div>
            <div className="binding-meta-item">
              <span className="binding-meta-label">验证码</span>
              <strong className="binding-meta-value binding-code-value">{pendingAttempt.verification_code}</strong>
            </div>
          </div>
          <div className="binding-meta-item binding-callback-box">
            <span className="binding-meta-label">确认接口</span>
            <strong className="binding-meta-value binding-code-value">{pendingAttempt.callback_path}</strong>
          </div>

          <div className="binding-form-grid">
            <div>
              <label className="form-label">微信 OpenID *</label>
              <input
                type="text"
                className="form-control app-form-control"
                value={bindOpenId}
                onChange={(event) => onBindOpenIdChange(event.target.value)}
                placeholder="请输入微信 open_id"
              />
            </div>
            <div>
              <label className="form-label">微信昵称</label>
              <input
                type="text"
                className="form-control app-form-control"
                value={bindDisplayName}
                onChange={(event) => onBindDisplayNameChange(event.target.value)}
                placeholder="可选，默认显示为微信用户"
              />
            </div>
            <div>
              <label className="form-label">头像 URL</label>
              <input
                type="text"
                className="form-control app-form-control"
                value={bindAvatarUrl}
                onChange={(event) => onBindAvatarUrlChange(event.target.value)}
                placeholder="可选，用于展示头像地址"
              />
            </div>
          </div>
        </div>
      )}

      <div className="binding-card-actions">
        <button type="button" className="btn btn-primary" onClick={onStartBinding} disabled={loading || Boolean(pendingAttempt)}>
          {pendingAttempt ? '绑定已发起' : '开始绑定微信'}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onConfirmBinding}
          disabled={loading || !canConfirm}
        >
          确认绑定
        </button>
        {binding && (
          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={onRemoveBinding}
            disabled={loading}
          >
            解除绑定
          </button>
        )}
      </div>
    </section>
  );
};

export default WeChatBindingCard;
