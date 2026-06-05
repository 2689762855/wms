import { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import apiClient from '../api/client';

export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: { oldPassword: string; newPassword: string }) => {
    setLoading(true);
    try {
      await apiClient.put('/auth/change-password', values);
      message.success('密码修改成功');
      form.resetFields();
      onClose();
    } catch (err: any) {
      message.error(err.response?.data?.error || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="修改密码" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={loading} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={onFinish} style={{ marginTop: 16 }}>
        <Form.Item name="oldPassword" label="旧密码" rules={[{ required: true, message: '请输入旧密码' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="newPassword" label="新密码" rules={[
          { required: true, message: '请输入新密码' },
          { min: 6, message: '密码至少6位' },
          { max: 128, message: '密码不能超过128位' },
        ]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
