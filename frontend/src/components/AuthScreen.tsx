import React, { FormEvent, useMemo, useState } from 'react';

interface AuthScreenProps {
  mode: 'setup' | 'login';
  loading: boolean;
  error: string | null;
  onSubmit: (secret: string) => Promise<void>;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ mode, loading, error, onSubmit }) => {
  const [secret, setSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const isSetup = mode === 'setup';

  const validationMessage = useMemo(() => {
    if (!secret.trim()) {
      return '请输入密钥。';
    }

    if (isSetup && secret !== confirmSecret) {
      return '两次输入的密钥不一致。';
    }

    return null;
  }, [confirmSecret, isSetup, secret]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationMessage) {
      return;
    }

    await onSubmit(secret.trim());
  };

  return (
    <div className="auth-shell">
      <div className="auth-card card shadow-sm border-0">
        <div className="card-body p-4 p-md-5">
          <div className="auth-brand mb-4">
            <div className="auth-brand-icon">🔐</div>
            <div>
              <h1 className="auth-title">甘特图 · 项目进度管理</h1>
              <p className="auth-subtitle mb-0">
                {isSetup ? '首次使用请先配置访问密钥。' : '请输入访问密钥继续使用系统。'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">密钥</label>
              <input
                type="password"
                className="form-control form-control-lg"
                placeholder={isSetup ? '请设置一个访问密钥' : '请输入已配置的访问密钥'}
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoFocus
                autoComplete={isSetup ? 'new-password' : 'current-password'}
              />
            </div>

            {isSetup && (
              <div className="mb-3">
                <label className="form-label">确认密钥</label>
                <input
                  type="password"
                  className="form-control form-control-lg"
                  placeholder="请再次输入密钥"
                  value={confirmSecret}
                  onChange={(event) => setConfirmSecret(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}

            <div className="auth-hint mb-3">
              {isSetup ? '配置完成后将自动登录，后续访问只需输入此密钥。' : '登录成功后会保持当前浏览器会话。'}
            </div>

            {(error || validationMessage) && (
              <div className="alert alert-danger" role="alert">
                {error || validationMessage}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg w-100" disabled={loading || Boolean(validationMessage)}>
              {loading ? '提交中...' : (isSetup ? '保存并进入系统' : '登录')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
