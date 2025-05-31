const express = require('express');
const axios = require('axios');
const natural = require('natural');
const { TfIdf } = natural;
const path = require('path');
const app = express();
require('dotenv').config();

const POLICY_QNA_URL = 'http://apis.data.go.kr/1140100/CivilPolicyQnaService/PolicyQnaList';
const POLICY_QNA_ITEM_URL = 'http://apis.data.go.kr/1140100/CivilPolicyQnaService/PolicyQnaItem';
const SERVICE_KEY = process.env.SERVICE_KEY || '/1iwjHt7iRohlMbB6FpiKFkh2dbCo7vvF1Kv742QkTXXjDyz877Y1NZnhjV6gvTeCNV78Jz0i1SvOSLke8JLlw==';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let resultList = [];
let qnaItems = []; // 모든 QNA 항목 저장

// 루트 경로에 키워드 입력 폼 제공
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>키워드 입력</title>
    </head>
    <body>
      <h2>키워드 입력</h2>
      <form action="/policyQnaList" method="GET">
        <input type="text" name="keyword" placeholder="키워드를 입력하세요" required>
        <button type="submit">검색</button>
      </form>
      <p>검색 결과는 /policyQnaList로 이동합니다.</p>
    </body>
    </html>
  `);
});

// 유사도 계산 함수
function calculateSimilarity(keyword, qnaTitl, ansCntnCl) {
  const tfidf = new TfIdf();
  tfidf.addDocument(keyword);
  tfidf.addDocument(qnaTitl + ' ' + ansCntnCl);
  let sim = 0;
  tfidf.tfidfs(keyword, 0, (i, measure) => { if (i === 1) sim = measure; });
  return sim;
}

// PolicyQnaList API 호출 및 resultList 저장
app.get('/policyQnaList', async (req, res) => {
  const {
    firstIndex = 1,
    recordCountPerPage = 10,
    type = 1,
    keyword = '국세청',
    searchType = 1,
    regFrom = '20220101',
    regTo = '20250529'
  } = req.query;

  try {
    const queryParams = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      firstIndex: Number(firstIndex),
      recordCountPerPage: Number(recordCountPerPage),
      type: Number(type),
      keyword,
      searchType: Number(searchType),
      regFrom,
      regTo
    });

    const response = await axios.get(POLICY_QNA_URL, { params: queryParams });
    resultList = response.data.resultList || [];
    res.json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json({
        error: error.message,
        response: error.response.data
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// [수정] 모든 QNA 항목 반환 (유사도 계산 X)
app.get('/callPolicyQnaItem', async (req, res) => {
  try {
    if (!resultList || resultList.length === 0) {
      return res.status(400).json({ error: "resultList가 비어있습니다. 먼저 /policyQnaList를 호출하세요." });
    }

    const itemPromises = resultList.map(item => {
      const queryParams = new URLSearchParams({
        serviceKey: SERVICE_KEY,
        faqNo: item.faqNo,
        dutySctnNm: item.dutySctnNm
      });

      return axios.get(POLICY_QNA_ITEM_URL, { params: queryParams })
        .then(response => ({
          faqNo: item.faqNo,
          dutySctnNm: item.dutySctnNm,
          result: response.data.resultData
        }))
        .catch(error => ({
          faqNo: item.faqNo,
          dutySctnNm: item.dutySctnNm,
          error: error.message
        }));
    });

    qnaItems = await Promise.all(itemPromises);
    res.json(qnaItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [수정] 최종 결과만 반환 (유사도 계산 O)
app.get('/getFinalResult', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    return res.status(400).json({ error: "keyword 파라미터가 필요합니다." });
  }

  if (!qnaItems || qnaItems.length === 0) {
    return res.status(400).json({ error: "QNA 항목이 없습니다. 먼저 /callPolicyQnaItem을 호출하세요." });
  }

  // 유사도 계산
  const itemsWithSimilarity = qnaItems.map(item => ({
    ...item,
    similarity: calculateSimilarity(
      keyword,
      item.result.qnaTitl,
      item.result.ansCntnCl
    )
  }));

  // 최대 유사도 항목 선택
  const final_result = itemsWithSimilarity.reduce((max, item) => 
    item.similarity > max.similarity ? item : max
  );

  res.json({ final_result });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});