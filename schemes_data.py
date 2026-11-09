"""Facts about five farm schemes, with where each fact came from.

Every figure below was read from the official page listed under ``sources`` on
AS_OF. Schemes change: the page tells the farmer to confirm with the bank. Do
not add a number here without a source.
"""

AS_OF = "2026-11-09"

# SMAM per-machine subsidy caps in rupees lakh (SMAM Revised Operational
# Guidelines, 18 Dec 2025, Annexure-I): (small/marginal, SC/ST, women, NE) vs (other).
# The source is a scanned PDF. The "other farmers" cap for 2WD 20-40 PTO HP was
# unreadable; 2.40 follows the pattern of every other row (other = 80% of the
# first column) and is marked as derived.
TRACTOR_CAPS_LAKH = {
    "2wd_upto20": {"label_en": "2WD tractor, up to 20 HP", "label_hi": "2WD ट्रैक्टर, 20 HP तक", "priority": 2.00, "other": 1.60},
    "4wd_upto20": {"label_en": "4WD tractor, up to 20 HP", "label_hi": "4WD ट्रैक्टर, 20 HP तक", "priority": 2.45, "other": 1.96},
    "2wd_20_40": {"label_en": "2WD tractor, 20 to 40 HP", "label_hi": "2WD ट्रैक्टर, 20 से 40 HP", "priority": 3.00, "other": 2.40, "other_derived": True},
    "4wd_20_40": {"label_en": "4WD tractor, 20 to 40 HP", "label_hi": "4WD ट्रैक्टर, 20 से 40 HP", "priority": 3.60, "other": 2.88},
    "2wd_40_50": {"label_en": "2WD tractor, 40 to 50 HP", "label_hi": "2WD ट्रैक्टर, 40 से 50 HP", "priority": 4.50, "other": 3.60},
    "4wd_40_50": {"label_en": "4WD tractor, 40 to 50 HP", "label_hi": "4WD ट्रैक्टर, 40 से 50 HP", "priority": 5.45, "other": 4.36},
    "2wd_above50": {"label_en": "2WD tractor, above 50 HP", "label_hi": "2WD ट्रैक्टर, 50 HP से ऊपर", "priority": 6.00, "other": 4.80},
    "4wd_above50": {"label_en": "4WD tractor, above 50 HP", "label_hi": "4WD ट्रैक्टर, 50 HP से ऊपर", "priority": 6.50, "other": 5.20},
}

TERMS = {
    "kcc": {
        "rate_before_incentive_percent": 7.0,
        "prompt_repayment_incentive_percent": 3.0,
        "effective_rate_percent": 4.0,
        "limit_rupees": 300_000,
        "allied_only_limit_rupees": 200_000,
        "last_confirmed_year": "2025-26",
    },
    "aif": {"interest_support_percent": 3.0, "loan_limit_rupees": 20_000_000, "support_years": 7},
    "smam": {"priority_percent": 50, "other_percent": 40},
    "pmfby": {"kharif_premium_percent": 2.0, "rabi_premium_percent": 1.5},
    "pm_kisan": {"per_year_rupees": 6_000, "instalment_rupees": 2_000, "instalments": 3},
}

SCHEMES = [
    {
        "id": "kcc",
        "kind": "loan",
        "name": {"en": "Kisan Credit Card (KCC) with interest support", "hi": "किसान क्रेडिट कार्ड (KCC), ब्याज सहायता के साथ"},
        "what": {
            "en": "A short-term credit line for crop expenses such as seed, fertiliser and labour, repaid after harvest. The government supports the interest so that a farmer who repays on time pays a low effective rate.",
            "hi": "फसल के खर्च (बीज, खाद, मज़दूरी) के लिए कम समय का कर्ज़, जो कटाई के बाद चुकाया जाता है। सरकार ब्याज में मदद करती है, इसलिए समय पर चुकाने वाले किसान को कम ब्याज देना पड़ता है।",
        },
        "terms": {
            "en": [
                "Interest rate 7% a year on loans up to ₹3 lakh (₹2 lakh if only for animal husbandry or fisheries).",
                "Up to 3% extra incentive if you repay on time (within one year of the loan date), so the effective rate is 4%.",
                "Confirmed for financial year 2025-26. Whether it continues this year is not confirmed here.",
            ],
            "hi": [
                "₹3 लाख तक के कर्ज़ पर 7% सालाना ब्याज (सिर्फ़ पशुपालन या मछली पालन के लिए ₹2 लाख तक)।",
                "समय पर (कर्ज़ की तारीख से एक साल के अंदर) चुकाने पर 3% तक अतिरिक्त छूट, यानी असल ब्याज 4%।",
                "वित्त वर्ष 2025-26 के लिए पक्का हुआ है। इस साल भी चालू है या नहीं, यह यहाँ पक्का नहीं है।",
            ],
        },
        "watch_out": {
            "en": ["If you repay late you lose the 3% incentive and pay 7%.", "Ask the bank whether the interest support is in force for this financial year."],
            "hi": ["देर से चुकाने पर 3% की छूट नहीं मिलती और 7% देना पड़ता है।", "बैंक से पूछें कि ब्याज सहायता इस वित्त वर्ष में चालू है या नहीं।"],
        },
        "ask_bank": {
            "en": ["Is the interest support (7% with 3% prompt-repayment incentive) in force this financial year?", "What credit limit will you sanction on my land and crop?", "By which date must I repay to keep the incentive?", "Are there processing fees, insurance charges or other deductions?", "Is crop insurance (PMFBY) added to the loan automatically?"],
            "hi": ["क्या 7% ब्याज और समय पर चुकाने की 3% छूट इस वित्त वर्ष में चालू है?", "मेरी ज़मीन और फसल पर बैंक कितनी सीमा मंज़ूर करेगा?", "छूट बनाए रखने के लिए मुझे किस तारीख तक चुकाना होगा?", "क्या प्रोसेसिंग फ़ीस, बीमा या दूसरी कटौतियाँ लगेंगी?", "क्या फसल बीमा (PMFBY) अपने-आप कर्ज़ में जुड़ जाएगा?"],
        },
        "sources": [{"title": "PM India: Modified Interest Subvention Scheme, FY 2025-26", "url": "https://www.pmindia.gov.in/?p=16616276"}],
    },
    {
        "id": "aif",
        "kind": "loan",
        "name": {"en": "Agriculture Infrastructure Fund (AIF)", "hi": "कृषि अवसंरचना कोष (AIF)"},
        "what": {
            "en": "Loans with 3% interest support for farm infrastructure after harvest, such as warehouses, cold storage, grading units, and shared farm assets. It is not meant for an ordinary tractor or for crop expenses.",
            "hi": "कटाई के बाद के ढाँचे (गोदाम, कोल्ड स्टोरेज, ग्रेडिंग यूनिट) और साझा खेती की संपत्ति के लिए 3% ब्याज सहायता वाला कर्ज़। यह आम ट्रैक्टर या फसल के खर्च के लिए नहीं है।",
        },
        "terms": {
            "en": ["3% interest support a year on loans up to ₹2 crore, for up to 7 years.", "Individual farmers, FPOs, self-help groups, cooperatives and agri-entrepreneurs can apply.", "Credit guarantee cover is available for loans up to ₹2 crore.", "Whether machinery such as a tractor qualifies is not stated on the pages read."],
            "hi": ["₹2 करोड़ तक के कर्ज़ पर सालाना 3% ब्याज सहायता, 7 साल तक।", "व्यक्तिगत किसान, FPO, स्वयं सहायता समूह, सहकारी समितियाँ और कृषि उद्यमी आवेदन कर सकते हैं।", "₹2 करोड़ तक के कर्ज़ पर क्रेडिट गारंटी की सुविधा।", "ट्रैक्टर जैसी मशीन इसमें आती है या नहीं, यह पढ़े गए पन्नों में नहीं लिखा है।"],
        },
        "watch_out": {
            "en": ["Only projects of the right type qualify; the bank decides.", "One state page mentions an extra incentive for prompt repayment; the central page does not, so it is not counted here."],
            "hi": ["सिर्फ़ सही तरह की परियोजनाएँ ही आती हैं; फ़ैसला बैंक करता है।", "एक राज्य के पन्ने पर समय पर चुकाने की अतिरिक्त छूट लिखी है, केंद्र के पन्ने पर नहीं, इसलिए यहाँ नहीं गिनी गई।"],
        },
        "ask_bank": {
            "en": ["Does my project (godown, cold storage, custom hiring centre) qualify under AIF?", "Is there a moratorium before repayment starts?", "Will the credit guarantee fee be paid by the government for my loan?", "What documents and project report do you need?"],
            "hi": ["क्या मेरी परियोजना (गोदाम, कोल्ड स्टोरेज, कस्टम हायरिंग सेंटर) AIF में आती है?", "चुकाना शुरू होने से पहले कोई छूट की अवधि मिलेगी?", "क्या मेरे कर्ज़ की क्रेडिट गारंटी फ़ीस सरकार देगी?", "कौन-से दस्तावेज़ और प्रोजेक्ट रिपोर्ट चाहिए?"],
        },
        "sources": [
            {"title": "PM India: Agriculture Infrastructure Fund", "url": "https://pmindia.gov.in/?p=7711291"},
            {"title": "Agriculture Department, Himachal Pradesh: AIF", "url": "https://agriculture.hp.gov.in/?p=1648"},
            {"title": "AIF portal", "url": "https://agriinfra.dac.gov.in"},
        ],
    },
    {
        "id": "smam",
        "kind": "subsidy",
        "name": {"en": "Sub-Mission on Agricultural Mechanization (SMAM)", "hi": "कृषि यंत्रीकरण उप-मिशन (SMAM)"},
        "what": {
            "en": "A subsidy on the price of farm machinery, including tractors, paid to selected farmers. It lowers what you must borrow, but you cannot count on getting it: states select beneficiaries, sometimes by lottery.",
            "hi": "ट्रैक्टर समेत खेती की मशीनों की कीमत पर सब्सिडी, जो चुने गए किसानों को मिलती है। इससे कर्ज़ कम लेना पड़ता है, लेकिन मिलना पक्का नहीं है: राज्य लाभार्थी चुनते हैं, कभी-कभी लॉटरी से।",
        },
        "terms": {
            "en": ["50% of the machine cost for small and marginal, SC/ST and women farmers (and farmers in North Eastern and Himalayan regions); 40% for other farmers.", "The subsidy is the lower of that percentage and a per-machine cap that depends on tractor size.", "Guidelines say tractors above 40 HP should mainly go through custom hiring centres, and individual ownership is discouraged.", "The subsidy is paid by direct bank transfer; the guidelines do not say how quickly."],
            "hi": ["छोटे और सीमांत, SC/ST और महिला किसानों (और उत्तर-पूर्व व हिमालयी क्षेत्र के किसानों) को मशीन की कीमत का 50%; बाकी किसानों को 40%।", "सब्सिडी इस प्रतिशत और ट्रैक्टर के आकार के हिसाब से तय प्रति-मशीन सीमा में से जो कम हो, वही मिलती है।", "दिशानिर्देश कहते हैं कि 40 HP से ऊपर के ट्रैक्टर मुख्य रूप से कस्टम हायरिंग सेंटर के ज़रिए दिए जाएँ; व्यक्तिगत मालिकाना हतोत्साहित है।", "सब्सिडी सीधे बैंक खाते में आती है; कितनी जल्दी, यह दिशानिर्देशों में नहीं लिखा।"],
        },
        "watch_out": {
            "en": ["Selection is not guaranteed, so do not plan the loan around a subsidy you may not get.", "The source document is a scan; one cap figure is derived, so confirm with your agriculture office."],
            "hi": ["चयन पक्का नहीं है, इसलिए ऐसी सब्सिडी के भरोसे कर्ज़ की योजना न बनाएँ जो शायद न मिले।", "स्रोत दस्तावेज़ स्कैन है; एक सीमा का आँकड़ा अनुमान से निकाला गया है, इसलिए कृषि कार्यालय से पक्का करें।"],
        },
        "ask_bank": {
            "en": ["Is SMAM open in my state and district, and how are farmers selected?", "Is the subsidy paid before or after I buy the machine, and how long does it take?", "Does this tractor size qualify for an individual subsidy?", "If I take a loan first, how will the subsidy be adjusted?"],
            "hi": ["क्या मेरे राज्य और ज़िले में SMAM चालू है, और किसान कैसे चुने जाते हैं?", "सब्सिडी मशीन खरीदने से पहले मिलती है या बाद में, और कितना समय लगता है?", "क्या इस आकार के ट्रैक्टर पर व्यक्तिगत सब्सिडी मिलती है?", "अगर मैं पहले कर्ज़ लूँ, तो सब्सिडी का समायोजन कैसे होगा?"],
        },
        "sources": [{"title": "SMAM Revised Operational Guidelines, 18 Dec 2025", "url": "https://agriculture.hp.gov.in/wp-content/uploads/2026/02/SMAM-Revised-Operational-Guidelines-dated-18-12-2025.pdf"}],
    },
    {
        "id": "pmfby",
        "kind": "insurance",
        "name": {"en": "Pradhan Mantri Fasal Bima Yojana (PMFBY)", "hi": "प्रधानमंत्री फसल बीमा योजना (PMFBY)"},
        "what": {
            "en": "Crop insurance. You pay a small premium and the government pays the rest. It can pay you if the crop is lost to drought, flood, hail, pests or disease.",
            "hi": "फसल बीमा। आप थोड़ा प्रीमियम देते हैं, बाकी सरकार देती है। सूखा, बाढ़, ओले, कीट या बीमारी से फसल खराब हो तो भुगतान मिल सकता है।",
        },
        "terms": {
            "en": ["Farmer premium: 2% of the sum insured in kharif, 1.5% in rabi.", "Covers drought, dry spells, floods, waterlogging, hail, cyclones, storms, landslides, pests and diseases, and some post-harvest losses.", "Farmers with a crop loan are enrolled by the bank automatically; they can opt out in writing before the cut-off date. Other farmers can enrol voluntarily."],
            "hi": ["किसान का प्रीमियम: बीमित राशि का खरीफ़ में 2%, रबी में 1.5%।", "सूखा, बारिश की कमी, बाढ़, जलभराव, ओले, चक्रवात, तूफ़ान, भूस्खलन, कीट और बीमारी, और कटाई के बाद के कुछ नुकसान।", "फसल कर्ज़ लेने वाले किसानों का बीमा बैंक अपने-आप करता है; वे कट-ऑफ तारीख से पहले लिखकर बाहर निकल सकते हैं। दूसरे किसान अपनी मर्ज़ी से जुड़ सकते हैं।"],
        },
        "watch_out": {
            "en": ["How much a claim pays depends on the notified yield for your area and crop. KuberKet cannot calculate it, so the page shows only the premium and the income at stake.", "Enrol before the cut-off date for the season."],
            "hi": ["दावे में कितना मिलेगा, यह आपके इलाके और फसल की अधिसूचित पैदावार पर निर्भर है। कुबेरकेत यह नहीं निकाल सकता, इसलिए पन्ना सिर्फ़ प्रीमियम और दाँव पर लगी कमाई दिखाता है।", "सीज़न की अंतिम तारीख से पहले नामांकन करें।"],
        },
        "ask_bank": {
            "en": ["What is the sum insured per hectare for my crop and area?", "What exact premium will be deducted, and when?", "What is the last date to enrol this season?", "How do I report a crop loss, and within how many days?"],
            "hi": ["मेरी फसल और इलाके में प्रति हेक्टेयर बीमित राशि कितनी है?", "ठीक कितना प्रीमियम और कब कटेगा?", "इस सीज़न में नामांकन की आख़िरी तारीख क्या है?", "फसल के नुकसान की सूचना कैसे दें, और कितने दिन में?"],
        },
        "sources": [
            {"title": "Agriculture Department, Himachal Pradesh: PMFBY", "url": "https://agriculture.hp.gov.in/?p=1611"},
            {"title": "PMFBY portal", "url": "https://pmfby.gov.in"},
        ],
    },
    {
        "id": "pm_kisan",
        "kind": "income_support",
        "name": {"en": "PM-KISAN", "hi": "पीएम-किसान"},
        "what": {
            "en": "A direct payment of ₹6,000 a year to eligible farmer families, in three instalments of ₹2,000. It is not a loan and need not be repaid, but it is small next to loan instalments.",
            "hi": "पात्र किसान परिवारों को सीधे बैंक खाते में सालाना ₹6,000, ₹2,000 की तीन किस्तों में। यह कर्ज़ नहीं है, लौटाना नहीं पड़ता, पर कर्ज़ की किस्तों के मुक़ाबले रकम छोटी है।",
        },
        "terms": {
            "en": ["₹2,000 every four months, ₹6,000 a year, sent to the bank account.", "Land-holding farmer families can apply. Income-tax payers, serving or retired government employees (with some exceptions), and some office-holders and professionals are excluded.", "The scheme requires Aadhaar on the official portal. KuberKet never asks for it."],
            "hi": ["हर चार महीने में ₹2,000, सालाना ₹6,000, बैंक खाते में।", "ज़मीन वाले किसान परिवार आवेदन कर सकते हैं। आयकर देने वाले, सेवारत या सेवानिवृत्त सरकारी कर्मचारी (कुछ अपवादों के साथ), और कुछ पदाधिकारी व पेशेवर बाहर हैं।", "योजना के आधिकारिक पोर्टल पर आधार चाहिए। कुबेरकेत इसे कभी नहीं माँगता।"],
        },
        "watch_out": {
            "en": ["The source document is an older FAQ. Eligibility rules, such as any land-size limit, have changed over time, so check the official portal for today's rules."],
            "hi": ["स्रोत दस्तावेज़ पुराना सवाल-जवाब पन्ना है। पात्रता के नियम (जैसे ज़मीन की सीमा) समय के साथ बदले हैं, इसलिए आज के नियम आधिकारिक पोर्टल पर देखें।"],
        },
        "ask_bank": {
            "en": ["Am I registered for PM-KISAN, and is my bank account linked?", "When was my last instalment paid?", "Which land records are needed to register?"],
            "hi": ["क्या मेरा पीएम-किसान में पंजीकरण है, और बैंक खाता जुड़ा है?", "मेरी आख़िरी किस्त कब आई थी?", "पंजीकरण के लिए कौन-से ज़मीन के कागज़ात चाहिए?"],
        },
        "sources": [
            {"title": "PM-KISAN FAQ (pmkisan.gov.in)", "url": "https://fw.pmkisan.gov.in/Documents/FAQPMKISAN.pdf"},
            {"title": "PM-KISAN portal", "url": "https://pmkisan.gov.in"},
        ],
    },
]
