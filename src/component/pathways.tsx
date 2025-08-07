import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Button,
  Input,
  message,
  Space,
  Spin,
  Table,
  Typography,
  Upload,
  UploadProps,
} from 'antd';
import axios from 'axios';
import * as Papa from 'papaparse';
import { useState } from 'react';

const { Paragraph } = Typography;

interface PathwayRow {
  id?: string; // Add unique id field
  Pathway: string;
  'Pathway Class': string;
  Subclass: string;
  Species: string;
  Source: string;
  URL: string;
  'UniProt IDS': string;
  Pathway_Class_assigned?: string;
  Subclass_assigned?: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

// Helper function to generate unique ID
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const PathwaysPage = () => {
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [data, setData] = useState<PathwayRow[]>([]);
  const [searchText, setSearchText] = useState('');

  const props: UploadProps = {
    name: 'file',
    accept: '.tsv',
    beforeUpload: (file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        message.error('File size exceeds 20 MB. Please upload a smaller file.');
        return false;
      }

      setLoading(true);
      Papa.parse<PathwayRow>(file, {
        header: true,
        delimiter: '\t',
        complete: async (result) => {
          try {
            const response = await axios.post('/api/pathways-assign', {
              pathways: result.data,
            });

            if (!response || !response.data) {
              message.error('No response received from server.');
              return;
            }

            if (response.status !== 200 || !response.data.tsv) {
              message.error('Unexpected server error or malformed response.');
              return;
            }

            const blob = new Blob([response.data.tsv], {
              type: 'text/tab-separated-values',
            });
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);

            // Add unique IDs to each row
            const dataWithIds = (response.data.preview || []).map(
              (row: PathwayRow) => ({
                ...row,
                id: generateUniqueId(),
              })
            );

            setData(dataWithIds);
          } catch (err: any) {
            console.error('API error:', err);
            message.error('Server error. Check network or try again later.');
          } finally {
            setLoading(false);
          }
        },
        error: (error) => {
          message.error(
            'Failed to parse TSV file. Please ensure format is correct.'
          );
          console.error('Parsing error:', error);
          setLoading(false);
        },
      });

      return false;
    },
  };

  const filteredData = data.filter((row) =>
    Object.values(row).some((val) =>
      val?.toString().toLowerCase().includes(searchText.toLowerCase())
    )
  );

  const columns = [
    {
      title: 'Pathway',
      dataIndex: 'Pathway',
      width: 220,
    },
    {
      title: 'Species',
      dataIndex: 'Species',
      width: 120,
    },
    {
      title: 'Database',
      dataIndex: 'Source',
      key: 'Database',
      width: 200,
      render: (_: string, record: PathwayRow) => (
        <div style={{ lineHeight: 1.4 }}>
          <strong>{record.Source}</strong>
          <br />
          <a
            href={record.URL}
            target='_blank'
            rel='noopener noreferrer'
            style={{ fontSize: 12, wordBreak: 'break-all' }}
          >
            {record.URL.replace(/^https?:\/\//, '')}
          </a>
        </div>
      ),
    },
    {
      title: 'UniProt IDS',
      dataIndex: 'UniProt IDS',
      width: 160,
      render: (text: string) => (
        <Paragraph
          ellipsis={{ rows: 1, expandable: true, symbol: 'more' }}
          style={{
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            maxWidth: 160,
            margin: 0,
          }}
        >
          {text}
        </Paragraph>
      ),
    },
    {
      title: 'Class Assigned',
      dataIndex: 'Pathway_Class_assigned',
      width: 180,
    },
    {
      title: 'Subclass Assigned',
      dataIndex: 'Subclass_assigned',
      width: 180,
    },
  ];

  return (
    <div style={{ padding: 32, background: '#fff', borderRadius: 8 }}>
      <h2 style={{ marginBottom: 16 }}>Pathways Class Reassignment</h2>

      <Space direction='vertical' style={{ width: '100%' }} size='large'>
        <Upload {...props} showUploadList={false}>
          <Button icon={<UploadOutlined />}>
            Upload pathways_classes_proteins_all.tsv
          </Button>
        </Upload>

        {downloadUrl && (
          <a href={downloadUrl} download='pathways_class_reassigned.tsv'>
            <Button icon={<DownloadOutlined />} type='primary'>
              Download Result File
            </Button>
          </a>
        )}

        <Input.Search
          placeholder='Search across all fields...'
          allowClear
          enterButton
          onSearch={(value) => setSearchText(value)}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ maxWidth: 400 }}
        />

        {loading ? (
          <Spin tip='Processing file using AI...' />
        ) : (
          <Table
            dataSource={filteredData}
            className='text-[1.5vh]'
            columns={columns}
            rowKey='id' // Use the unique id field
            expandable={{
              expandedRowRender: (record) => (
                <div className='flex flex-row gap-[20vw] text-[1vh]'>
                  <div>
                    <p className='text-[1.5vh]'>
                      <strong>Original Pathway Class:</strong>{' '}
                      {record['Pathway Class'] || 'None'}
                    </p>
                    <p className='text-[1.5vh]'>
                      <strong>Original Subclass:</strong>{' '}
                      {record['Subclass'] || 'None'}
                    </p>
                  </div>
                  <div>
                    <p className='text-[1.5vh]'>
                      <strong>Assigned Class:</strong>{' '}
                      {record['Pathway_Class_assigned'] || 'None'}
                    </p>
                    <p className='text-[1.5vh]'>
                      <strong>Assigned Subclass:</strong>{' '}
                      {record['Subclass_assigned'] || 'None'}
                    </p>
                  </div>
                </div>
              ),
            }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: true }}
            bordered
          />
        )}
      </Space>
    </div>
  );
};

export default PathwaysPage;
