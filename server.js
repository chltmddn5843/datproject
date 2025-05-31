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
let qnaItems = [];
let currentKeyword = ''; // 현재 검색 키워드 저장

// 루트 경로: 키워드 입력 폼
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
function calculateSimilarity(keyword, text1, text2 = '') {
  const tfidf = new TfIdf();
  tfidf.addDocument(keyword);
  tfidf.addDocument(`${text1} ${text2}`);
  let similarity = 0;
  tfidf.tfidfs(keyword, 0, (i, measure) => {
    if (i === 1) similarity = measure;
  });
  return similarity;
}

// 1차: PolicyQnaList API 호출 및 제목 기준 유사도 상위 3개만 저장
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

  currentKeyword = keyword;

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
    const originList = response.data.resultList || [];

    // 제목 기준 유사도 계산 및 상위 3개만 추출
    const filteredList = originList
      .map(item => ({
        ...item,
        similarity: calculateSimilarity(keyword, item.qnaTitl)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    resultList = filteredList;
    res.json({ ...response.data, resultList: filteredList });
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

// 2차: 각 항목 상세조회 및 제목+내용 기준 유사도 계산
app.get('/callPolicyQnaItem', async (req, res) => {
  if (!resultList || resultList.length === 0) {
    return res.status(400).json({ error: "resultList가 비어있습니다. 먼저 /policyQnaList를 호출하세요." });
  }

  try {
    const itemPromises = resultList.map(async item => {
      const queryParams = new URLSearchParams({
        serviceKey: SERVICE_KEY,
        faqNo: item.faqNo,
        dutySctnNm: item.dutySctnNm
      });

      try {
        const response = await axios.get(POLICY_QNA_ITEM_URL, { params: queryParams });
        const detail = response.data.resultData;
        return {
          ...item,
          result: detail,
          similarity: calculateSimilarity(
            currentKeyword,
            detail.qnaTitl,
            detail.ansCntnCl
          )
        };
      } catch (error) {
        return {
          ...item,
          result: null,
          similarity: 0,
          error: error.message
        };
      }
    });

    // 상세내역 유사도 기준 내림차순 정렬
    qnaItems = (await Promise.all(itemPromises))
      .sort((a, b) => b.similarity - a.similarity);

    res.json(qnaItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 최종: 유사도 가장 높은 상세내역 1개 반환
app.get('/getFinalResult', (req, res) => {
  if (!qnaItems || qnaItems.length === 0) {
    return res.status(400).json({ error: "QNA 항목이 없습니다. 먼저 /callPolicyQnaItem을 호출하세요." });
  }

  const finalResult = qnaItems[0]; // 이미 유사도 내림차순 정렬됨
  res.json({ final_result: finalResult });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
