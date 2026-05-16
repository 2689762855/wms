import { Modal, Form, Input, InputNumber, message } from 'antd';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateCustomerModal({ open, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();

  const mutation = useMutation({
    mutationFn: (values: { username: string; password: string; realName: string; warehouseName?: string; maxWarehouses?: number }) =>
      apiClient.post('/customers', values),
    onSuccess: () => {
      message.success('客户已开通，自动分配专属仓库');
      form.resetFields();
      onSuccess();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  return (
    <Modal title="开通新客户" open={open} onCancel={onClose} onOk={() => form.submit()}
      confirmLoading={mutation.isPending} style={{ maxWidth: 420 }}
    >
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
        <Form.Item name="username" label="登录用户名" rules={[{ required: true, message: '请输入' }]}>
          <Input placeholder="客户登录用户名，全局唯一" />
        </Form.Item>
        <Form.Item name="password" label="登录密码" rules={[{ required: true, message: '请输入' }]}>
          <Input.Password placeholder="至少6位" />
        </Form.Item>
        <Form.Item name="realName" label="客户名称" rules={[{ required: true, message: '请输入' }]}>
          <Input placeholder="如：科华公司" />
        </Form.Item>
        <Form.Item name="warehouseName" label="仓库名称">
          <Input placeholder="默认「客户名称主仓库」" />
        </Form.Item>
        <Form.Item name="maxWarehouses" label="仓库数量上限" initialValue={1}>
          <InputNumber min={1} max={50} placeholder="1" style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
