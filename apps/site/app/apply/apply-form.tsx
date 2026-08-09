"use client";

import {
  cloneElement,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type ApplyFormProps = {
  lineOaUrl?: string;
};

type FormStatus = "idle" | "submitting" | "blocked" | "success" | "failure";

type ApplyFormValues = {
  brandName: string;
  storeType: string;
  branchInfo: string;
  city: string;
  address: string;
  website: string;
  vegetarianStatus: string;
  vegetarianTypes: string[];
  businessHours: string;
  contactName: string;
  phone: string;
  email: string;
  contactPreference: string;
  cooperationTypes: string[];
  cooperationIdea: string;
  confirmAccuracy: boolean;
  consentPrivacy: boolean;
};

type FieldErrors = Partial<Record<keyof ApplyFormValues, string>>;

const initialValues: ApplyFormValues = {
  brandName: "",
  storeType: "",
  branchInfo: "",
  city: "",
  address: "",
  website: "",
  vegetarianStatus: "",
  vegetarianTypes: [],
  businessHours: "",
  contactName: "",
  phone: "",
  email: "",
  contactPreference: "",
  cooperationTypes: [],
  cooperationIdea: "",
  confirmAccuracy: false,
  consentPrivacy: false,
};

const taiwanCities = [
  "基隆市",
  "臺北市",
  "新北市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
] as const;

const vegetarianTypeOptions = [
  "全素／純素",
  "蛋奶素",
  "奶素",
  "蛋素",
  "五辛素",
  "其他蔬食",
] as const;

const cooperationOptions = [
  {
    value: "合作店家",
    title: "合作店家",
    description: "加入 Looper 店家網絡，讓玩家在城市裡找到你的店。",
    icon: "店",
  },
  {
    value: "玩家任務據點",
    title: "玩家任務據點",
    description: "成為玩家完成蔬食任務與現場確認的實際地點。",
    icon: "任",
  },
  {
    value: "星星兌換",
    title: "星星兌換",
    description: "了解如何讓玩家把累積的星星帶回真實生活使用。",
    icon: "星",
  },
  {
    value: "城市／聯合活動",
    title: "城市／聯合活動",
    description: "參與城市主題、跨店合作或期間限定的共同企劃。",
    icon: "城",
  },
] as const;

const processSteps = [
  {
    number: "01",
    title: "收到申請資料",
    description: "Looper 會依你填寫的資料了解店家現況與合作方向。",
  },
  {
    number: "02",
    title: "確認合作需求",
    description: "團隊檢視適合的合作方式，需要補充時會與你聯絡。",
  },
  {
    number: "03",
    title: "安排後續說明",
    description: "雙方確認方向後，再討論內容、時程與後續設定。",
  },
] as const;

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

function isPreviewHost() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith(".vercel.app")
  );
}

export function ApplyForm({ lineOaUrl }: ApplyFormProps) {
  const [values, setValues] = useState<ApplyFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<FormStatus>("idle");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const submittingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const previewState = params.get("preview-state");
    if (!isPreviewHost()) return;
    if (previewState === "success") setStatus("success");
    if (previewState === "failure") setStatus("failure");
  }, []);

  useEffect(
    () => () => {
      if (submittingTimer.current) clearTimeout(submittingTimer.current);
    },
    [],
  );

  const selectedCooperationCount = values.cooperationTypes.length;

  function clearError(field: keyof ApplyFormValues) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function setTextField(
    field: keyof ApplyFormValues,
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    clearError(field);
    if (status === "failure" || status === "blocked") setStatus("idle");
  }

  function setBooleanField(
    field: "confirmAccuracy" | "consentPrivacy",
    checked: boolean,
  ) {
    setValues((current) => ({ ...current, [field]: checked }));
    clearError(field);
  }

  function toggleArrayField(
    field: "vegetarianTypes" | "cooperationTypes",
    value: string,
  ) {
    setValues((current) => {
      const selected = current[field].includes(value);
      return {
        ...current,
        [field]: selected
          ? current[field].filter((item) => item !== value)
          : [...current[field], value],
      };
    });
    clearError(field);
  }

  function validateForm() {
    const nextErrors: FieldErrors = {};
    if (!values.brandName.trim())
      nextErrors.brandName = "請填寫店家或品牌名稱。";
    if (!values.storeType) nextErrors.storeType = "請選擇店家型態。";
    if (!values.branchInfo.trim())
      nextErrors.branchInfo = "請填寫目前的店家或分店資料。";
    if (!values.city) nextErrors.city = "請選擇主要營業縣市。";
    if (!values.address.trim()) nextErrors.address = "請填寫主要店址。";
    if (values.website && !/^https?:\/\//i.test(values.website.trim())) {
      nextErrors.website = "請輸入以 http:// 或 https:// 開頭的完整連結。";
    }
    if (!values.vegetarianStatus) {
      nextErrors.vegetarianStatus = "請選擇目前的蔬食供應狀況。";
    }
    if (
      values.vegetarianStatus !== "目前未供應" &&
      values.vegetarianTypes.length === 0
    ) {
      nextErrors.vegetarianTypes = "請至少選擇一種蔬食類型。";
    }
    if (!values.businessHours.trim())
      nextErrors.businessHours = "請填寫營業時間。";
    if (!values.contactName.trim())
      nextErrors.contactName = "請填寫聯絡人姓名。";
    const phoneDigits = normalizePhone(values.phone);
    if (!values.phone.trim()) {
      nextErrors.phone = "請填寫聯絡電話。";
    } else if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      nextErrors.phone = "請確認電話號碼，需包含 8～15 位數字。";
    }
    if (!values.email.trim()) {
      nextErrors.email = "請填寫 Email。";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      nextErrors.email = "請輸入正確的 Email 格式。";
    }
    if (!values.contactPreference) {
      nextErrors.contactPreference = "請選擇偏好聯絡方式。";
    }
    if (values.cooperationTypes.length === 0) {
      nextErrors.cooperationTypes = "請至少選擇一項合作方向。";
    }
    if (!values.confirmAccuracy) {
      nextErrors.confirmAccuracy = "請確認以上資料正確。";
    }
    if (!values.consentPrivacy) {
      nextErrors.consentPrivacy = "請閱讀並同意個資蒐集與使用說明。";
    }
    return nextErrors;
  }

  function focusFirstError(nextErrors: FieldErrors) {
    const firstField = Object.keys(nextErrors)[0];
    if (!firstField) return;
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-field="${firstField}"] input:not([type="hidden"]), [data-field="${firstField}"] select, [data-field="${firstField}"] textarea`,
      );
      target?.focus();
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setHasAttemptedSubmit(true);
    const nextErrors = validateForm();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus("idle");
      focusFirstError(nextErrors);
      return;
    }

    setStatus("submitting");
    submittingTimer.current = setTimeout(() => {
      setStatus("blocked");
      submittingTimer.current = null;
    }, 700);
  }

  function retrySubmission() {
    setStatus("idle");
    document.getElementById("apply-submit")?.focus();
  }

  function resetForm() {
    setValues(initialValues);
    setErrors({});
    setStatus("idle");
    setHasAttemptedSubmit(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (status === "success") {
    return (
      <main id="main-content" className="apply-page">
        <section
          className="apply-status apply-status--success"
          aria-labelledby="apply-success-title"
        >
          <div className="apply-status__inner">
            <span className="apply-status__icon" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">PREVIEW SUCCESS STATE</p>
            <h1 id="apply-success-title">合作申請已收到</h1>
            <p className="apply-status__lead">
              謝謝你願意和 Looper 一起讓蔬食行動走進更多人的日常。
            </p>
            <p className="apply-preview-note">
              Preview 測試編號：APPLY-PREVIEW-001
            </p>
            <div className="apply-status__steps" aria-label="送出後流程">
              {processSteps.map((step) => (
                <article key={step.number}>
                  <span>{step.number}</span>
                  <div>
                    <h2>{step.title}</h2>
                    <p>{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="apply-status__actions">
              {lineOaUrl ? (
                <a className="button button--primary" href={lineOaUrl}>
                  加入 LINE 官方帳號
                </a>
              ) : (
                <span className="button button--disabled" aria-disabled="true">
                  LINE 聯絡入口準備中
                </span>
              )}
              <button
                className="button button--secondary"
                type="button"
                onClick={resetForm}
              >
                填寫另一筆申請
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="apply-page">
      <section className="apply-hero" aria-labelledby="apply-title">
        <div className="container apply-hero__inner">
          <p className="eyebrow">PARTNER WITH LOOPER</p>
          <h1 id="apply-title">一起把新的客人帶進店裡</h1>
          <p className="apply-hero__lead">
            告訴我們你的店家現況與合作想法。Looper
            會依申請內容確認適合的合作方式，再與你聯絡後續安排。
          </p>
          <div className="apply-assurance" aria-label="申請前資訊">
            <article>
              <span aria-hidden="true">01</span>
              <h2>約 5～8 分鐘</h2>
              <p>準備基本店家資料即可開始填寫。</p>
            </article>
            <article>
              <span aria-hidden="true">02</span>
              <h2>不需要上傳文件</h2>
              <p>這一步不收合約、菜單、金流或身分資料。</p>
            </article>
            <article>
              <span aria-hidden="true">03</span>
              <h2>可複選合作方向</h2>
              <p>還不確定適合哪一種，也可以先了解。</p>
            </article>
          </div>
        </div>
      </section>

      <section className="apply-workspace section--warm">
        <div className="container apply-layout">
          <form className="apply-form" noValidate onSubmit={handleSubmit}>
            <div className="apply-form__intro">
              <p className="eyebrow">APPLICATION FORM</p>
              <h2>合作申請資料</h2>
              <p>
                <span className="required-mark" aria-hidden="true">
                  ＊
                </span>{" "}
                為必填欄位
              </p>
            </div>

            <section
              className="apply-form__section"
              aria-labelledby="store-data-title"
            >
              <div className="apply-form__heading">
                <span>A02</span>
                <div>
                  <h2 id="store-data-title">店家基本資料</h2>
                  <p>先填主要店家或品牌資料，分店細節可以在後續聯絡時補充。</p>
                </div>
              </div>
              <div className="apply-fields">
                <FieldShell
                  label="店家／品牌名稱"
                  field="brandName"
                  error={errors.brandName}
                  required
                >
                  <input
                    id="brandName"
                    name="brandName"
                    autoComplete="organization"
                    value={values.brandName}
                    onChange={(event) => setTextField("brandName", event)}
                  />
                </FieldShell>
                <FieldShell
                  label="店家型態"
                  field="storeType"
                  error={errors.storeType}
                  required
                >
                  <select
                    id="storeType"
                    name="storeType"
                    value={values.storeType}
                    onChange={(event) => setTextField("storeType", event)}
                  >
                    <option value="">請選擇</option>
                    <option>個人單店</option>
                    <option>多店品牌</option>
                    <option>餐飲品牌</option>
                    <option>其他</option>
                  </select>
                </FieldShell>
                <FieldShell
                  label="分店資料"
                  field="branchInfo"
                  error={errors.branchInfo}
                  required
                  hint="填寫目前店數與主要分店即可，例如：1 家單店；臺北、新北共 3 家。"
                >
                  <input
                    id="branchInfo"
                    name="branchInfo"
                    value={values.branchInfo}
                    onChange={(event) => setTextField("branchInfo", event)}
                  />
                </FieldShell>
                <FieldShell
                  label="主要營業縣市"
                  field="city"
                  error={errors.city}
                  required
                >
                  <select
                    id="city"
                    name="city"
                    autoComplete="address-level1"
                    value={values.city}
                    onChange={(event) => setTextField("city", event)}
                  >
                    <option value="">請選擇</option>
                    {taiwanCities.map((city) => (
                      <option key={city}>{city}</option>
                    ))}
                  </select>
                </FieldShell>
                <FieldShell
                  className="apply-field--full"
                  label="主要店址"
                  field="address"
                  error={errors.address}
                  required
                  hint="多分店品牌先填一間主要聯絡門市即可。"
                >
                  <input
                    id="address"
                    name="address"
                    autoComplete="street-address"
                    value={values.address}
                    onChange={(event) => setTextField("address", event)}
                  />
                </FieldShell>
                <FieldShell
                  className="apply-field--full"
                  label="官方網站／社群連結"
                  field="website"
                  error={errors.website}
                  hint="選填，請貼上以 https:// 開頭的完整連結。"
                >
                  <input
                    id="website"
                    name="website"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://"
                    value={values.website}
                    onChange={(event) => setTextField("website", event)}
                  />
                </FieldShell>
              </div>

              <fieldset
                className={`apply-fieldset${errors.vegetarianStatus ? " has-error" : ""}`}
                data-field="vegetarianStatus"
                aria-describedby={
                  errors.vegetarianStatus ? "vegetarianStatus-error" : undefined
                }
              >
                <legend>
                  蔬食供應狀況 <RequiredMark />
                </legend>
                <div className="apply-choice-row">
                  {[
                    "目前固定供應",
                    "部分時段／品項供應",
                    "規劃中",
                    "目前未供應",
                  ].map((option) => (
                    <label key={option}>
                      <input
                        type="radio"
                        name="vegetarianStatus"
                        value={option}
                        checked={values.vegetarianStatus === option}
                        onChange={(event) =>
                          setTextField("vegetarianStatus", event)
                        }
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                <FieldError
                  id="vegetarianStatus-error"
                  message={errors.vegetarianStatus}
                />
              </fieldset>

              <fieldset
                className={`apply-fieldset${errors.vegetarianTypes ? " has-error" : ""}`}
                data-field="vegetarianTypes"
                aria-describedby={
                  errors.vegetarianTypes ? "vegetarianTypes-error" : undefined
                }
              >
                <legend>
                  蔬食類型 <RequiredMark />
                </legend>
                <p className="apply-fieldset__hint">
                  可複選；若目前未供應，這一題可以略過。
                </p>
                <div className="apply-choice-row">
                  {vegetarianTypeOptions.map((option) => (
                    <label key={option}>
                      <input
                        type="checkbox"
                        checked={values.vegetarianTypes.includes(option)}
                        onChange={() =>
                          toggleArrayField("vegetarianTypes", option)
                        }
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                <FieldError
                  id="vegetarianTypes-error"
                  message={errors.vegetarianTypes}
                />
              </fieldset>

              <div className="apply-fields">
                <FieldShell
                  className="apply-field--full"
                  label="營業時間"
                  field="businessHours"
                  error={errors.businessHours}
                  required
                  hint="請簡要填寫固定營業日與時間；臨時休息或特殊時段可於後續補充。"
                >
                  <textarea
                    id="businessHours"
                    name="businessHours"
                    rows={3}
                    placeholder="例如：週二至週日 11:30–20:30，週一公休"
                    value={values.businessHours}
                    onChange={(event) => setTextField("businessHours", event)}
                  />
                </FieldShell>
              </div>
            </section>

            <section
              className="apply-form__section"
              aria-labelledby="contact-data-title"
            >
              <div className="apply-form__heading">
                <span>A03</span>
                <div>
                  <h2 id="contact-data-title">申請人與聯絡方式</h2>
                  <p>這些資料只用於合作評估、聯絡與後續安排。</p>
                </div>
              </div>
              <div className="apply-fields">
                <FieldShell
                  label="聯絡人"
                  field="contactName"
                  error={errors.contactName}
                  required
                >
                  <input
                    id="contactName"
                    name="contactName"
                    autoComplete="name"
                    value={values.contactName}
                    onChange={(event) => setTextField("contactName", event)}
                  />
                </FieldShell>
                <FieldShell
                  label="電話"
                  field="phone"
                  error={errors.phone}
                  required
                >
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0912-345-678"
                    value={values.phone}
                    onChange={(event) => setTextField("phone", event)}
                  />
                </FieldShell>
                <FieldShell
                  label="Email"
                  field="email"
                  error={errors.email}
                  required
                >
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={values.email}
                    onChange={(event) => setTextField("email", event)}
                  />
                </FieldShell>
                <FieldShell
                  label="偏好聯絡方式"
                  field="contactPreference"
                  error={errors.contactPreference}
                  required
                >
                  <select
                    id="contactPreference"
                    name="contactPreference"
                    value={values.contactPreference}
                    onChange={(event) =>
                      setTextField("contactPreference", event)
                    }
                  >
                    <option value="">請選擇</option>
                    <option>電話</option>
                    <option>Email</option>
                    <option>LINE</option>
                  </select>
                </FieldShell>
              </div>
            </section>

            <section
              className="apply-form__section"
              aria-labelledby="cooperation-title"
            >
              <div className="apply-form__heading">
                <span>A04</span>
                <div>
                  <h2 id="cooperation-title">希望了解的合作方式</h2>
                  <p>可複選，選擇目前最有興趣的方向即可。</p>
                </div>
              </div>
              <fieldset
                className={`cooperation-fieldset${errors.cooperationTypes ? " has-error" : ""}`}
                data-field="cooperationTypes"
                aria-describedby={
                  errors.cooperationTypes
                    ? "cooperationTypes-error"
                    : "cooperationTypes-hint"
                }
              >
                <legend className="sr-only">合作方式</legend>
                <p className="sr-only" id="cooperationTypes-hint">
                  請至少選擇一項合作方向。
                </p>
                <div className="cooperation-grid">
                  {cooperationOptions.map((option) => {
                    const selected = values.cooperationTypes.includes(
                      option.value,
                    );
                    return (
                      <label
                        className={`cooperation-card${selected ? " is-selected" : ""}`}
                        key={option.value}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            toggleArrayField("cooperationTypes", option.value)
                          }
                        />
                        <span
                          className="cooperation-card__icon"
                          aria-hidden="true"
                        >
                          {option.icon}
                        </span>
                        <span className="cooperation-card__copy">
                          <strong>{option.title}</strong>
                          <span>{option.description}</span>
                        </span>
                        <span
                          className="cooperation-card__check"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      </label>
                    );
                  })}
                </div>
                <label className="understand-option">
                  <input
                    type="checkbox"
                    checked={values.cooperationTypes.includes("先了解合作方式")}
                    onChange={() =>
                      toggleArrayField("cooperationTypes", "先了解合作方式")
                    }
                  />
                  <span>
                    <strong>先了解合作方式</strong>
                    <small>目前還沒有確定方向，希望先由 Looper 說明。</small>
                  </span>
                </label>
                <FieldError
                  id="cooperationTypes-error"
                  message={errors.cooperationTypes}
                />
                {selectedCooperationCount > 0 ? (
                  <p className="selection-summary" aria-live="polite">
                    已選擇 {selectedCooperationCount} 項合作方向
                  </p>
                ) : null}
              </fieldset>

              <div className="apply-fields">
                <FieldShell
                  className="apply-field--full"
                  label="店家特色／合作想法"
                  field="cooperationIdea"
                  hint="選填，簡單說明希望被看見的特色、既有活動或合作構想。"
                >
                  <textarea
                    id="cooperationIdea"
                    name="cooperationIdea"
                    rows={5}
                    maxLength={800}
                    value={values.cooperationIdea}
                    onChange={(event) => setTextField("cooperationIdea", event)}
                  />
                </FieldShell>
              </div>
            </section>

            <section
              className="apply-form__section apply-confirm"
              aria-labelledby="confirm-title"
            >
              <div className="apply-form__heading">
                <span>A05</span>
                <div>
                  <h2 id="confirm-title">確認與送出</h2>
                  <p>送出前請確認資料與個資使用說明。</p>
                </div>
              </div>
              <div className="privacy-summary">
                <h3>個資蒐集與使用說明</h3>
                <p>
                  蒐集目的為合作申請評估、聯絡、補充資料與後續合作安排；蒐集範圍限於本表單所填店家資料及聯絡資料。
                </p>
                <span className="legal-link--pending" aria-disabled="true">
                  隱私權政策入口準備中
                </span>
              </div>
              <div className="confirmation-list">
                <label
                  className={errors.confirmAccuracy ? "has-error" : ""}
                  data-field="confirmAccuracy"
                >
                  <input
                    type="checkbox"
                    checked={values.confirmAccuracy}
                    onChange={(event) =>
                      setBooleanField("confirmAccuracy", event.target.checked)
                    }
                    aria-describedby={
                      errors.confirmAccuracy
                        ? "confirmAccuracy-error"
                        : undefined
                    }
                  />
                  <span>
                    我已確認以上資料正確 <RequiredMark />
                  </span>
                </label>
                <FieldError
                  id="confirmAccuracy-error"
                  message={errors.confirmAccuracy}
                />
                <label
                  className={errors.consentPrivacy ? "has-error" : ""}
                  data-field="consentPrivacy"
                >
                  <input
                    type="checkbox"
                    checked={values.consentPrivacy}
                    onChange={(event) =>
                      setBooleanField("consentPrivacy", event.target.checked)
                    }
                    aria-describedby={
                      errors.consentPrivacy ? "consentPrivacy-error" : undefined
                    }
                  />
                  <span>
                    我同意 Looper 為上述目的蒐集與使用本次申請資料{" "}
                    <RequiredMark />
                  </span>
                </label>
                <FieldError
                  id="consentPrivacy-error"
                  message={errors.consentPrivacy}
                />
              </div>

              {hasAttemptedSubmit && Object.keys(errors).length > 0 ? (
                <div className="form-notice form-notice--error" role="alert">
                  <strong>還有資料需要確認</strong>
                  <p>請依欄位下方提示完成必填內容，再重新送出。</p>
                </div>
              ) : null}

              {status === "blocked" || status === "failure" ? (
                <div
                  className="form-notice form-notice--error"
                  role="alert"
                  tabIndex={-1}
                >
                  <strong>
                    {status === "failure"
                      ? "這次沒有成功送出"
                      : "正式送出功能尚未開放"}
                  </strong>
                  <p>
                    {status === "failure"
                      ? "目前無法完成傳送，請保留已填資料並稍後重試。"
                      : "你的欄位已通過檢查，但正式資料保存位置仍待確認，因此本次沒有傳送或保存資料。"}
                  </p>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={retrySubmission}
                  >
                    回到表單重試
                  </button>
                </div>
              ) : null}

              <button
                id="apply-submit"
                className="button button--primary apply-submit"
                type="submit"
                disabled={status === "submitting"}
                aria-describedby="submission-readiness"
              >
                {status === "submitting" ? "正在檢查申請資料…" : "送出合作申請"}
              </button>
              <p id="submission-readiness" className="submission-readiness">
                Preview
                目前可完成欄位檢查；正式資料送出將於保存位置與法務資料確認後接通。
              </p>
            </section>
          </form>

          <aside className="apply-aside" aria-label="送出後流程與協助">
            <section className="apply-process" aria-labelledby="process-title">
              <p className="eyebrow">A06 · WHAT HAPPENS NEXT</p>
              <h2 id="process-title">送出後會怎麼進行</h2>
              <ol>
                {processSteps.map((step) => (
                  <li key={step.number}>
                    <span>{step.number}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="apply-process__note">
                提出申請不代表立即成立合作；實際內容會在雙方確認後安排。
              </p>
            </section>
            <section className="apply-help" aria-labelledby="help-title">
              <p className="eyebrow">A07 · NEED HELP</p>
              <h2 id="help-title">填寫時需要協助嗎</h2>
              <p>
                如果不確定欄位怎麼填，可以先完成已知資料，合作細節之後再一起確認。
              </p>
              {lineOaUrl ? (
                <a className="button button--secondary" href={lineOaUrl}>
                  前往 LINE 官方帳號
                </a>
              ) : (
                <span className="button button--disabled" aria-disabled="true">
                  LINE 聯絡入口準備中
                </span>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function RequiredMark() {
  return (
    <span className="required-mark" aria-label="必填">
      ＊
    </span>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      <span aria-hidden="true">!</span>
      {message}
    </p>
  );
}

function FieldShell({
  children,
  className = "",
  error,
  field,
  hint,
  label,
  required = false,
}: {
  children: ReactNode;
  className?: string;
  error?: string;
  field: keyof ApplyFormValues;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  const describedBy =
    [hint ? `${field}-hint` : "", error ? `${field}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const child = children as ReactElement<{
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;

  return (
    <div
      className={`apply-field ${error ? "has-error" : ""} ${className}`.trim()}
      data-field={field}
    >
      <label htmlFor={field}>
        {label}{" "}
        {required ? (
          <RequiredMark />
        ) : (
          <span className="optional-mark">選填</span>
        )}
      </label>
      {cloneElement(child, {
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error),
      })}
      {hint ? (
        <p className="field-hint" id={`${field}-hint`}>
          {hint}
        </p>
      ) : null}
      <FieldError id={`${field}-error`} message={error} />
    </div>
  );
}
