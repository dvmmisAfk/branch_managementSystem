import fs from 'fs';
const p = String.rawd:\coding\tata_management website\frontend\src\pages\BranchesManagementPage.tsx;
const content = 
import { App, Button, Card, Form, Input, Modal, Select, Switch, Table, Tag, Tabs, Upload } from 'antd';
import { Plus, Search, Building2, UploadCloud, GitBranch, Check, X, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ApiError, apiFetch, clearTokens } from '../api/client';
import { PageHeader, EmptyState } from '../components/ui';
import { useTablePagination } from '../components/tableViewAll';
.trim();
fs.writeFileSync(p, content + '\n', 'utf8');
console.log('imports written, size:', fs.statSync(p).size);
