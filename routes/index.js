const express = require("express");
const got = require("got");

const router = express.Router();

// 첫 화면 - 로그인 페이지로 리다이렉트
router.get('/', function (req, res) {
  res.redirect('/login');
});

// 로그인 페이지
router.get('/login', function (req, res) {
  res.render('login');
});

// 회원가입 페이지
router.get('/join', function (req, res) {
  res.render('join');
});

// 결제 페이지 (팝업용)
router.get('/payment', function (req, res) {
  res.render('index');
});

// PharmChecker 메인 페이지
router.get('/pharmchecker', function (req, res) {
  res.render('pharmchecker');
});

// 결제 성공 페이지
router.get('/success', function (req, res) {
  res.render('success');
});

// 결제 실패 페이지
router.get('/fail', function (req, res) {
  res.render('fail', {
    code: req.query.code || 'UNKNOWN_ERROR',
    message: req.query.message || '알 수 없는 에러가 발생했습니다.'
  });
});

// 구매 완료 페이지
router.get('/purchase-complete', function (req, res) {
  res.render('purchase-complete');
});

router.post("/confirm", function (req, res) {
  // 클라이언트에서 받은 JSON 요청 바디입니다.
  const { paymentKey, orderId, amount } = req.body;

  // 토스페이먼츠 API는 시크릿 키를 사용자 ID로 사용하고, 비밀번호는 사용하지 않습니다.
  // 비밀번호가 없다는 것을 알리기 위해 시크릿 키 뒤에 콜론을 추가합니다.
  const widgetSecretKey = "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
  const encryptedSecretKey =
    "Basic " + Buffer.from(widgetSecretKey + ":").toString("base64");

  // 결제를 승인하면 결제수단에서 금액이 차감돼요.
  got
    .post("https://api.tosspayments.com/v1/payments/confirm", {
      headers: {
        Authorization: encryptedSecretKey,
        "Content-Type": "application/json",
      },
      json: {
        orderId: orderId,
        amount: amount,
        paymentKey: paymentKey,
      },
      responseType: "json",
    })
    .then(function (response) {
      // 결제 성공 비즈니스 로직을 구현하세요.
      console.log(response.body);
      res.status(response.statusCode).json(response.body)
    })
    .catch(function (error) {
      // 결제 실패 비즈니스 로직을 구현하세요.
      console.log(error.response.body);
      res.status(error.response.statusCode).json(error.response.body)
    });
});

module.exports = router;