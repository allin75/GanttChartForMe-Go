import React, { FormEvent, useMemo, useState } from 'react';
import { AuthLoginPayload, AuthSetupPayload } from '../types';

interface AuthScreenProps {
  mode: 'setup' | 'login';
  loading: boolean;
  error: string | null;
  onSubmit: (payload: AuthSetupPayload | AuthLoginPayload) => Promise<void>;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ mode, loading, error, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const isSetup = mode === 'setup';

  const validationMessage = useMemo(() => {
    if (!username.trim()) {
      return '请输入账号。';
    }

    if (!password.trim()) {
      return '请输入密码。';
    }

    if (password.trim().length < 6) {
      return '密码至少 6 位。';
    }

    if (isSetup && password !== confirmPassword) {
      return '两次输入的密码不一致。';
    }

    return null;
  }, [confirmPassword, isSetup, password, username]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationMessage) {
      return;
    }

    if (isSetup) {
      await onSubmit({
        username: username.trim(),
        password: password.trim(),
        display_name: displayName.trim() || undefined,
      });
      return;
    }

    await onSubmit({
      username: username.trim(),
      password: password.trim(),
    });
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <section className="auth-panel auth-panel-feature">
          <div className="auth-panel-glow" />
          <div className="auth-brand">
            <div className="auth-brand-icon">◈</div>
            <div>
              <span className="auth-kicker">Admin Console</span>
              <h1 className="auth-title">甘特图 · 项目进度管理</h1>
            </div>
          </div>
        </section>

        <div className="auth-card auth-panel card shadow-sm border-0">
          <div className="card-body p-4 p-md-5">
            <div className="auth-form-header mb-4">
              <span className="auth-kicker">{isSetup ? 'Initial Setup' : 'Secure Access'}</span>
              <h2 className="auth-form-title">{isSetup ? '创建管理员账号' : '账号登录'}</h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">账号</label>
                <input
                  type="text"
                  className="form-control form-control-lg auth-input"
                  placeholder={isSetup ? '请输入管理员账号' : '请输入账号'}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoFocus
                  autoComplete="username"
                />
              </div>

              {isSetup && (
                <div className="mb-3">
                  <label className="form-label">显示名称</label>
                  <input
                    type="text"
                    className="form-control form-control-lg auth-input"
                    placeholder="可选"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="mb-3">
                <label className="form-label">密码</label>
                <input
                  type="password"
                  className="form-control form-control-lg auth-input"
                  placeholder={isSetup ? '请设置登录密码' : '请输入密码'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSetup ? 'new-password' : 'current-password'}
                />
              </div>

              {isSetup && (
                <div className="mb-3">
                  <label className="form-label">确认密码</label>
                  <input
                    type="password"
                    className="form-control form-control-lg auth-input"
                    placeholder="请再次输入密码"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {(error || validationMessage) && (
                <div className="alert alert-danger auth-alert" role="alert">
                  {error || validationMessage}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-lg w-100 auth-submit" disabled={loading || Boolean(validationMessage)}>
                {loading ? '提交中...' : (isSetup ? '创建并进入系统' : '登录')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
